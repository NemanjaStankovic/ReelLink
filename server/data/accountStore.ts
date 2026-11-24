import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { mergeAccountState } from '../../src/game/accountState.js'
import type { AccountState } from '../../src/game/accountState.js'

export interface GoogleProfile {
  googleSub: string
  email: string | null
  name: string | null
  picture: string | null
}

export interface StoredAccount {
  id: string
  name: string | null
  email: string | null
  picture: string | null
}

const EMPTY_STATS = {
  gamesPlayed: 0,
  optimalGames: 0,
  bestSteps: null,
  bestTimeSeconds: null,
  recentResults: [],
}

export class AccountStore {
  constructor(private readonly pool: Pool) {}

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reellink_accounts (
        id UUID PRIMARY KEY,
        google_sub TEXT UNIQUE NOT NULL,
        email TEXT,
        name TEXT,
        picture TEXT,
        stats JSONB NOT NULL DEFAULT '${JSON.stringify(EMPTY_STATS)}'::jsonb,
        collection JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  async upsertGoogleProfile(profile: GoogleProfile): Promise<StoredAccount> {
    const result = await this.pool.query<StoredAccount>(
      `INSERT INTO reellink_accounts (id, google_sub, email, name, picture)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_sub) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         picture = EXCLUDED.picture,
         updated_at = NOW()
       RETURNING id, name, email, picture`,
      [randomUUID(), profile.googleSub, profile.email, profile.name, profile.picture],
    )
    return result.rows[0]
  }

  async getProfile(googleSub: string): Promise<StoredAccount | null> {
    const result = await this.pool.query<StoredAccount>(
      'SELECT id, name, email, picture FROM reellink_accounts WHERE google_sub = $1',
      [googleSub],
    )
    return result.rows[0] ?? null
  }

  async getState(googleSub: string): Promise<AccountState | null> {
    const result = await this.pool.query<AccountState>(
      'SELECT stats, collection FROM reellink_accounts WHERE google_sub = $1',
      [googleSub],
    )
    return result.rows[0] ?? null
  }

  async mergeState(googleSub: string, incoming: AccountState): Promise<AccountState> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query<AccountState>(
        'SELECT stats, collection FROM reellink_accounts WHERE google_sub = $1 FOR UPDATE',
        [googleSub],
      )
      if (!current.rows[0]) throw new Error('Authenticated ReelLink account was not found.')
      const merged = mergeAccountState(incoming, current.rows[0])
      await client.query(
        `UPDATE reellink_accounts
         SET stats = $2::jsonb, collection = $3::jsonb, updated_at = NOW()
         WHERE google_sub = $1`,
        [googleSub, JSON.stringify(merged.stats), JSON.stringify(merged.collection)],
      )
      await client.query('COMMIT')
      return merged
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
