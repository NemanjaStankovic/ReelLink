import 'dotenv/config'
import express from 'express'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import type { EntityKind } from '../src/game/model.js'
import { registerGoogleAuthRoutes } from './auth/googleAuth.js'
import { AccountStore } from './data/accountStore.js'
import { TmdbCatalog } from './data/tmdbCatalog.js'
import { TmdbClient, TmdbError } from './data/tmdbClient.js'
import { PuzzleService } from './services/puzzleService.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const catalog = new TmdbCatalog(new TmdbClient())
const puzzles = new PuzzleService(catalog)
const accountPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null
const accountStore = accountPool ? new AccountStore(accountPool) : null
const entityKinds: EntityKind[] = ['movie', 'tv', 'actor']

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
registerGoogleAuthRoutes(app, accountStore)

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    tmdbConfigured: Boolean(process.env.TMDB_API_KEY),
    accountConfigured: Boolean(
      accountStore
      && process.env.GOOGLE_CLIENT_ID
      && process.env.GOOGLE_CLIENT_SECRET
      && (process.env.AUTH_SESSION_SECRET?.length ?? 0) >= 32,
    ),
  })
})

app.get('/api/search', async (request, response, next) => {
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : ''
  if (query.length < 2 || query.length > 100) {
    response.status(400).json({ error: 'Search must be between 2 and 100 characters.' })
    return
  }
  try {
    response.json({ results: await catalog.search(query) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/entities/:kind/:id', async (request, response, next) => {
  const { kind, id } = request.params
  if (!entityKinds.includes(kind as EntityKind) || !/^\d+$/.test(id)) {
    response.status(400).json({ error: 'Invalid entity kind or ID.' })
    return
  }
  try {
    response.json(await catalog.getEntity(kind as EntityKind, id))
  } catch (error) {
    next(error)
  }
})

app.get('/api/entities/:kind/:id/connections', async (request, response, next) => {
  const { kind, id } = request.params
  if (!entityKinds.includes(kind as EntityKind) || !/^\d+$/.test(id)) {
    response.status(400).json({ error: 'Invalid entity kind or ID.' })
    return
  }
  try {
    const [entity, connections] = await Promise.all([
      catalog.getEntity(kind as EntityKind, id),
      catalog.getConnections(kind as EntityKind, id),
    ])
    response.json({ entity, connections })
  } catch (error) {
    next(error)
  }
})

app.get('/api/puzzles/random', async (_request, response, next) => {
  try {
    response.json(await puzzles.createRandomPuzzle())
  } catch (error) {
    next(error)
  }
})

const frontendPath = resolve(process.cwd(), 'dist')
app.use(express.static(frontendPath))
app.get('/{*path}', (_request, response, next) => {
  response.sendFile(resolve(frontendPath, 'index.html'), (error) => {
    if (error) next(error)
  })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof TmdbError) {
    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds))
    }
    response.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof Error && error.message.startsWith('TMDB did not provide enough')) {
    response.status(503).json({ error: 'Could not create a connected puzzle from the available credits. Try again.' })
    return
  }
  console.error('Unhandled API error:', error)
  response.status(500).json({ error: 'An unexpected server error occurred.' })
})

if (accountStore) await accountStore.initialize()

app.listen(port, () => {
  console.log(`ReelLink API listening on http://localhost:${port}`)
})
