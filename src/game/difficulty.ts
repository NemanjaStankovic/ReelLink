export const DIFFICULTY_TIERS = ['bronze', 'silver', 'gold'] as const

export type DifficultyTier = typeof DIFFICULTY_TIERS[number]

export function getDifficultyTier(steps: number): DifficultyTier | null {
  if (steps >= 2 && steps <= 3) return 'bronze'
  if (steps >= 4 && steps <= 6) return 'silver'
  if (steps >= 7 && steps <= 9) return 'gold'
  return null
}

export function getHigherDifficulty(first: DifficultyTier, second: DifficultyTier): DifficultyTier {
  const rank: Record<DifficultyTier, number> = { bronze: 0, silver: 1, gold: 2 }
  return rank[first] >= rank[second] ? first : second
}
