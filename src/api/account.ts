import type { AccountState } from '../game/accountState.js'

export interface AccountUser {
  id: string
  name: string | null
  email: string | null
  picture: string | null
}

interface AuthStatus {
  configured: boolean
  user: AccountUser | null
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      && typeof body.error === 'string'
      ? body.error
      : 'The account request could not be completed.'
    throw new Error(message)
  }
  return body as T
}

export const getAuthStatus = (): Promise<AuthStatus> =>
  request<AuthStatus>('/api/auth/me')

export const getAccountState = (): Promise<AccountState> =>
  request<AccountState>('/api/account/state')

export const saveAccountState = (state: AccountState): Promise<AccountState> =>
  request<AccountState>('/api/account/state', {
    method: 'PUT',
    body: JSON.stringify(state),
  })

export const logoutAccount = (): Promise<{ success: boolean }> =>
  request<{ success: boolean }>('/api/auth/logout', { method: 'POST' })
