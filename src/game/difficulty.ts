export const DIFFICULTY_TIERS = ['bronze', 'silver', 'gold'] as const

export type DifficultyTier = typeof DIFFICULTY_TIERS[number]
export type CardQuality = DifficultyTier | 'unranked'

const rewardStepOverages: Record<DifficultyTier, number> = {
  bronze: 0,
  silver: 4,
  gold: 6,
}

export function getDifficultyTier(steps: number): DifficultyTier | null {
  if (steps >= 2 && steps <= 3) return 'bronze'
  if (steps >= 4 && steps <= 6) return 'silver'
  if (steps >= 7 && steps <= 9) return 'gold'
  return null
}

export function getRewardStepLimit(shortestSteps: number): number | null {
  const tier = getDifficultyTier(shortestSteps)
  return tier ? shortestSteps + rewardStepOverages[tier] : null
}

export function getEarnedCardQuality(shortestSteps: number, stepsTaken: number): CardQuality | null {
  const tier = getDifficultyTier(shortestSteps)
  const stepLimit = getRewardStepLimit(shortestSteps)
  if (!tier || stepLimit === null) return null
  return stepsTaken <= stepLimit ? tier : 'unranked'
}

export function getHigherDifficulty(first: CardQuality, second: CardQuality): CardQuality {
  const rank: Record<CardQuality, number> = { unranked: 0, bronze: 1, silver: 2, gold: 3 }
  return rank[first] >= rank[second] ? first : second
}
