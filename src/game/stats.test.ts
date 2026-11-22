import { describe, expect, it } from 'vitest'
import { readPlayerStats, recordGameResult } from './stats.js'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

describe('local player stats', () => {
  it('starts empty and tracks best scores and the optimal count', () => {
    const storage = createStorage()
    expect(readPlayerStats(storage).gamesPlayed).toBe(0)
    recordGameResult(storage, { steps: 4, shortestSteps: 3, seconds: 45, completedAt: '2026-01-01' })
    recordGameResult(storage, { steps: 2, shortestSteps: 2, seconds: 60, completedAt: '2026-01-02' })
    const result = recordGameResult(storage, { steps: 2, shortestSteps: 2, seconds: 50, completedAt: '2026-01-03' })
    expect(result).toMatchObject({ gamesPlayed: 3, optimalGames: 2, bestSteps: 2, bestTimeSeconds: 50 })
  })

  it('resets malformed stored data instead of breaking gameplay', () => {
    const storage = createStorage()
    storage.setItem('reellink.stats.v1', '{malformed')
    expect(readPlayerStats(storage).gamesPlayed).toBe(0)
    expect(storage.getItem('reellink.stats.v1')).toBeNull()
  })
})
