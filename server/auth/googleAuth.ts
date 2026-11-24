import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { AccountStore } from '../data/accountStore.js'
import type { StoredAccount } from '../data/accountStore.js'
import type { AccountState } from '../../src/game/accountState.js'
import type { CollectedCard } from '../../src/game/collection.js'
import type { CatalogEntity } from '../../src/api/types.js'
import type { PlayerStats } from '../../src/game/stats.js'

const SESSION_COOKIE = 'reellink_session'
const OAUTH_STATE_COOKIE = 'reellink_oauth_state'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const OAUTH_STATE_TTL_SECONDS = 60 * 10
const LOCAL_CALLBACK_URL = 'http://localhost:3001/auth/google/callback'
const LOCAL_FRONTEND_URL = 'http://localhost:5173'

interface GoogleSession {
  sub: string
  exp: number
}

export function createGoogleSessionToken(
  googleSub: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload = Buffer.from(JSON.stringify({
    sub: googleSub,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyGoogleSessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<GoogleSession>
    return typeof session.sub === 'string'
      && session.sub.length > 0
      && typeof session.exp === 'number'
      && session.exp > nowSeconds
      ? session.sub
      : null
  } catch {
    return null
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.cookie
  if (!cookieHeader) return null
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
}

function isCatalogEntity(value: unknown): value is CatalogEntity {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && value.id.length <= 30
    && (value.kind === 'movie' || value.kind === 'tv' || value.kind === 'actor')
    && typeof value.name === 'string'
    && value.name.length <= 300
    && (value.year === null || (typeof value.year === 'string' && value.year.length <= 20))
    && (value.imageUrl === null
      || (typeof value.imageUrl === 'string' && value.imageUrl.length <= 2048))
    && typeof value.description === 'string'
    && value.description.length <= 20000
    && typeof value.popularity === 'number'
    && Number.isFinite(value.popularity)
    && (value.rating === undefined || value.rating === null
      || (typeof value.rating === 'number' && Number.isFinite(value.rating)))
    && (value.knownFor === undefined
      || (typeof value.knownFor === 'string' && value.knownFor.length <= 1000))
    && (value.character === undefined || value.character === null
      || (typeof value.character === 'string' && value.character.length <= 2000))
}

function isPlayerStats(value: unknown): value is PlayerStats {
  if (!isRecord(value)) return false
  return isNonnegativeInteger(value.gamesPlayed)
    && isNonnegativeInteger(value.optimalGames)
    && value.optimalGames <= value.gamesPlayed
    && (value.bestSteps === null || isNonnegativeInteger(value.bestSteps))
    && (value.bestTimeSeconds === null || isNonnegativeInteger(value.bestTimeSeconds))
    && Array.isArray(value.recentResults)
    && value.recentResults.length <= 20
    && value.recentResults.every((result) => isRecord(result)
      && isNonnegativeInteger(result.steps)
      && isNonnegativeInteger(result.shortestSteps)
      && isNonnegativeInteger(result.seconds)
      && isTimestamp(result.completedAt))
}

function isCollectedCard(value: unknown): value is CollectedCard {
  if (!isRecord(value)) return false
  return isCatalogEntity(value.entity)
    && isNonnegativeInteger(value.correctGuesses)
    && value.correctGuesses > 0
    && isTimestamp(value.firstGuessedAt)
    && isTimestamp(value.lastGuessedAt)
    && (value.bestDifficulty === 'bronze'
      || value.bestDifficulty === 'silver'
      || value.bestDifficulty === 'gold'
      || value.bestDifficulty === 'unranked')
}

function isAccountState(value: unknown): value is AccountState {
  return isRecord(value)
    && isPlayerStats(value.stats)
    && Array.isArray(value.collection)
    && value.collection.length <= 1000
    && value.collection.every(isCollectedCard)
}

function sendAccountError(response: Response, status: number, message: string): void {
  response.status(status).json({ error: message })
}

function accountUser(account: StoredAccount) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    picture: account.picture,
  }
}

export function registerGoogleAuthRoutes(
  app: Express,
  accounts: AccountStore | null,
): void {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const sessionSecret = process.env.AUTH_SESSION_SECRET
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL
    ?? (isProduction ? 'https://reellink.onrender.com/auth/google/callback' : LOCAL_CALLBACK_URL)
  const frontendUrl = process.env.FRONTEND_URL
    ?? (isProduction ? 'https://reellink.onrender.com' : LOCAL_FRONTEND_URL)
  const allowedOrigin = new URL(frontendUrl).origin
  const configured = Boolean(clientId && clientSecret && sessionSecret && sessionSecret.length >= 32 && accounts)
  const oauth = clientId && clientSecret
    ? new OAuth2Client(clientId, clientSecret, callbackUrl)
    : null

  const sessionCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  }

  const sessionSub = (request: Request): string | null => {
    if (!sessionSecret) return null
    const token = getCookie(request, SESSION_COOKIE)
    return token ? verifyGoogleSessionToken(token, sessionSecret) : null
  }

  const requireAccount = (request: Request, response: Response): string | null => {
    if (!configured) {
      sendAccountError(response, 503, 'Google sign-in is not configured on this server.')
      return null
    }
    const sub = sessionSub(request)
    if (!sub) sendAccountError(response, 401, 'Sign in with Google to access your account.')
    return sub
  }

  const verifyOrigin = (request: Request, response: Response): boolean => {
    const origin = request.get('origin')
    if (!origin || origin === allowedOrigin) return true
    sendAccountError(response, 403, 'This account request came from an untrusted origin.')
    return false
  }

  app.get('/auth/google', (_request, response) => {
    if (!configured || !oauth) {
      sendAccountError(response, 503, 'Google sign-in is not configured on this server.')
      return
    }
    const state = randomBytes(32).toString('base64url')
    response.cookie(OAUTH_STATE_COOKIE, state, {
      ...sessionCookieOptions,
      path: '/auth/google/callback',
      maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
    })
    response.redirect(oauth.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state,
    }))
  })

  app.get('/auth/google/callback', async (request, response) => {
    const stateCookie = getCookie(request, OAUTH_STATE_COOKIE)
    const queryState = typeof request.query.state === 'string' ? request.query.state : ''
    response.clearCookie(OAUTH_STATE_COOKIE, { ...sessionCookieOptions, path: '/auth/google/callback' })
    if (!configured || !oauth || !accounts || !sessionSecret) {
      sendAccountError(response, 503, 'Google sign-in is not configured on this server.')
      return
    }
    if (!stateCookie || stateCookie !== queryState) {
      sendAccountError(response, 400, 'Google sign-in could not be verified. Please try again.')
      return
    }
    if (typeof request.query.code !== 'string') {
      sendAccountError(response, 400, 'Google did not return an authorization code.')
      return
    }

    const { tokens } = await oauth.getToken(request.query.code)
    if (!tokens.id_token) {
      sendAccountError(response, 401, 'Google did not provide a verified identity.')
      return
    }
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId })
    const payload = ticket.getPayload()
    if (!payload?.sub || payload.email_verified !== true) {
      sendAccountError(response, 401, 'Google did not provide a verified account.')
      return
    }

    await accounts.upsertGoogleProfile({
      googleSub: payload.sub,
      email: payload.email ?? null,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    })
    response.cookie(SESSION_COOKIE, createGoogleSessionToken(payload.sub, sessionSecret), {
      ...sessionCookieOptions,
      maxAge: SESSION_TTL_SECONDS * 1000,
    })
    response.redirect(frontendUrl)
  })

  app.get('/api/auth/me', async (request, response) => {
    if (!configured || !accounts) {
      response.json({ configured: false, user: null })
      return
    }
    const sub = sessionSub(request)
    const account = sub ? await accounts.getProfile(sub) : null
    response.json({ configured: true, user: account ? accountUser(account) : null })
  })

  app.post('/api/auth/logout', (request, response) => {
    if (!verifyOrigin(request, response)) return
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions)
    response.json({ success: true })
  })

  app.get('/api/account/state', async (request, response) => {
    const sub = requireAccount(request, response)
    if (!sub || !accounts) return
    const state = await accounts.getState(sub)
    if (!state) {
      sendAccountError(response, 404, 'ReelLink account data was not found.')
      return
    }
    response.json(state)
  })

  app.put('/api/account/state', async (request, response) => {
    if (!verifyOrigin(request, response)) return
    const sub = requireAccount(request, response)
    if (!sub || !accounts) return
    if (!isAccountState(request.body)) {
      sendAccountError(response, 400, 'The account data has an invalid format.')
      return
    }
    response.json(await accounts.mergeState(sub, request.body))
  })
}
