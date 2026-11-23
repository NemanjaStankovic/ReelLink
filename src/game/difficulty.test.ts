import { describe, expect, it } from 'vitest'
import {
  getDifficultyTier,
  getEarnedCardQuality,
  getHigherDifficulty,
  getRewardStepLimit,
} from './difficulty.js'

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
    expect(getHigherDifficulty('bronze', 'unranked')).toBe('bronze')
    expect(getHigherDifficulty('unranked', 'silver')).toBe('silver')
  })

  it.each([
    [2, 2],
    [4, 8],
    [7, 13],
    [9, 15],
  ])('sets the %i-step puzzle reward limit to %i steps', (shortestSteps, limit) => {
    expect(getRewardStepLimit(shortestSteps)).toBe(limit)
  })

  it('awards the puzzle tier within its step allowance and grayscale beyond it', () => {
    expect(getEarnedCardQuality(2, 2)).toBe('bronze')
    expect(getEarnedCardQuality(3, 5)).toBe('unranked')
    expect(getEarnedCardQuality(4, 8)).toBe('silver')
    expect(getEarnedCardQuality(4, 9)).toBe('unranked')
    expect(getEarnedCardQuality(7, 13)).toBe('gold')
    expect(getEarnedCardQuality(7, 14)).toBe('unranked')
    expect(getEarnedCardQuality(10, 10)).toBeNull()
  })
})
