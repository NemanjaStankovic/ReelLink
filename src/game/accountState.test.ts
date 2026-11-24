import { describe, expect, it } from 'vitest'
import { mergeAccountState } from './accountState.js'
import type { AccountState } from './accountState.js'
import type { CatalogEntity } from '../api/types.js'
import { EMPTY_PLAYER_STATS } from './stats.js'

const entity = (kind: CatalogEntity['kind'], id: string): CatalogEntity => ({
  id,
  kind,
  name: `${kind} ${id}`,
  year: null,
  imageUrl: null,
  description: '',
  popularity: 1,
})

const state = (overrides: Partial<AccountState> = {}): AccountState => ({
  stats: { ...EMPTY_PLAYER_STATS },
  collection: [],
  ...overrides,
})

describe('account state merging', () => {
  it('merges statistics and unique cards without double-counting duplicate browser snapshots', () => {
    const film = entity('movie', '1')
    const local = state({
      stats: {
        gamesPlayed: 4,
        optimalGames: 2,
        bestSteps: 3,
        bestTimeSeconds: 42,
        recentResults: [{ steps: 3, shortestSteps: 3, seconds: 42, completedAt: '2026-01-02' }],
      },
      collection: [{
        entity: film,
        correctGuesses: 2,
        firstGuessedAt: '2026-01-01',
        lastGuessedAt: '2026-01-02',
        bestDifficulty: 'bronze',
      }],
    })
    const account = state({
      stats: {
        gamesPlayed: 4,
        optimalGames: 2,
        bestSteps: 3,
        bestTimeSeconds: 42,
        recentResults: [{ steps: 3, shortestSteps: 3, seconds: 42, completedAt: '2026-01-02' }],
      },
      collection: [{
        entity: film,
        correctGuesses: 2,
        firstGuessedAt: '2026-01-01',
        lastGuessedAt: '2026-01-02',
        bestDifficulty: 'bronze',
      }],
    })

    expect(mergeAccountState(local, account)).toEqual(local)
  })

  it('preserves the better scores, highest card tier, and unique cards from both sources', () => {
    const local = state({
      stats: {
        ...EMPTY_PLAYER_STATS,
        gamesPlayed: 5,
        optimalGames: 3,
        bestSteps: 3,
        bestTimeSeconds: 40,
      },
      collection: [{
        entity: entity('movie', '1'),
        correctGuesses: 3,
        firstGuessedAt: '2026-01-01',
        lastGuessedAt: '2026-01-03',
        bestDifficulty: 'silver',
      }],
    })
    const account = state({
      stats: {
        ...EMPTY_PLAYER_STATS,
        gamesPlayed: 7,
        optimalGames: 4,
        bestSteps: 2,
        bestTimeSeconds: 50,
      },
      collection: [{
        entity: entity('movie', '1'),
        correctGuesses: 2,
        firstGuessedAt: '2026-01-02',
        lastGuessedAt: '2026-01-04',
        bestDifficulty: 'gold',
      }, {
        entity: entity('tv', '2'),
        correctGuesses: 1,
        firstGuessedAt: '2026-01-04',
        lastGuessedAt: '2026-01-04',
        bestDifficulty: 'bronze',
      }],
    })

    const merged = mergeAccountState(local, account)

    expect(merged.stats).toMatchObject({
      gamesPlayed: 7,
      optimalGames: 4,
      bestSteps: 2,
      bestTimeSeconds: 50,
    })
    expect(merged.collection).toHaveLength(2)
    expect(merged.collection.find((card) => card.entity.id === '1')).toMatchObject({
      correctGuesses: 3,
      firstGuessedAt: '2026-01-01',
      lastGuessedAt: '2026-01-04',
      bestDifficulty: 'gold',
    })
  })
})
