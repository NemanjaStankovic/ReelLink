import { describe, expect, it } from 'vitest'
import { getDifficultyTier, getHigherDifficulty } from './difficulty.js'

describe('puzzle difficulty tiers', () => {
  it.each([
    [1, null],
    [2, 'bronze'],
    [3, 'bronze'],
    [4, 'silver'],
    [6, 'silver'],
    [7, 'gold'],
    [9, 'gold'],
    [10, null],
  ] as const)('maps %i shortest steps to %s', (steps, difficulty) => {
    expect(getDifficultyTier(steps)).toBe(difficulty)
  })

  it('retains the highest difficulty earned', () => {
    expect(getHigherDifficulty('silver', 'bronze')).toBe('silver')
    expect(getHigherDifficulty('silver', 'gold')).toBe('gold')
  })
})
