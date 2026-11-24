import type { CollectedCard } from './collection.js'
import { getHigherDifficulty } from './difficulty.js'
import type { PlayerStats } from './stats.js'

export interface AccountState {
  stats: PlayerStats
  collection: CollectedCard[]
}

export function mergeAccountState(local: AccountState, account: AccountState): AccountState {
  const bestResult = [local.stats, account.stats]
    .filter((stats) => stats.bestSteps !== null)
    .sort((a, b) =>
      (a.bestSteps ?? Number.MAX_SAFE_INTEGER) - (b.bestSteps ?? Number.MAX_SAFE_INTEGER)
      || (a.bestTimeSeconds ?? Number.MAX_SAFE_INTEGER) - (b.bestTimeSeconds ?? Number.MAX_SAFE_INTEGER),
    )[0]
  const recentResults = new Map<string, PlayerStats['recentResults'][number]>()
  for (const result of [...local.stats.recentResults, ...account.stats.recentResults]) {
    recentResults.set(
      `${result.completedAt}:${result.steps}:${result.shortestSteps}:${result.seconds}`,
      result,
    )
  }

  const cards = new Map<string, CollectedCard>()
  for (const card of [...local.collection, ...account.collection]) {
    const key = `${card.entity.kind}:${card.entity.id}`
    const previous = cards.get(key)
    if (!previous) {
      cards.set(key, card)
      continue
    }

    const latest = card.lastGuessedAt >= previous.lastGuessedAt ? card : previous
    cards.set(key, {
      ...latest,
      correctGuesses: Math.max(previous.correctGuesses, card.correctGuesses),
      firstGuessedAt: previous.firstGuessedAt <= card.firstGuessedAt
        ? previous.firstGuessedAt
        : card.firstGuessedAt,
      lastGuessedAt: previous.lastGuessedAt >= card.lastGuessedAt
        ? previous.lastGuessedAt
        : card.lastGuessedAt,
      bestDifficulty: getHigherDifficulty(previous.bestDifficulty, card.bestDifficulty),
    })
  }

  return {
    stats: {
      gamesPlayed: Math.max(local.stats.gamesPlayed, account.stats.gamesPlayed),
      optimalGames: Math.max(local.stats.optimalGames, account.stats.optimalGames),
      bestSteps: bestResult?.bestSteps ?? null,
      bestTimeSeconds: bestResult?.bestTimeSeconds ?? null,
      recentResults: [...recentResults.values()]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, 20),
    },
    collection: [...cards.values()],
  }
}
