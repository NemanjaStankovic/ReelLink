import { describe, expect, it } from 'vitest'
import { createGoogleSessionToken, verifyGoogleSessionToken } from './googleAuth.js'

describe('Google account sessions', () => {
  it('accepts a valid signed session before expiry', () => {
    const token = createGoogleSessionToken('google-user-123', 'a sufficiently long test secret', 100)

    expect(verifyGoogleSessionToken(token, 'a sufficiently long test secret', 101))
      .toBe('google-user-123')
  })

  it('rejects expired or tampered sessions', () => {
    const token = createGoogleSessionToken('google-user-123', 'a sufficiently long test secret', 100)
    const [payload, signature] = token.split('.')

    expect(verifyGoogleSessionToken(token, 'a sufficiently long test secret', 100 + 60 * 60 * 24 * 7))
      .toBeNull()
    expect(verifyGoogleSessionToken(`${payload}.${signature}x`, 'a sufficiently long test secret', 101))
      .toBeNull()
    expect(verifyGoogleSessionToken(token, 'a different test secret', 101)).toBeNull()
  })
})
