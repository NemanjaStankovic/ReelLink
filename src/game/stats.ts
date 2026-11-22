const STORAGE_KEY = 'reellink.stats.v1'

export interface GameResult {
  steps: number
  shortestSteps: number
  seconds: number
  completedAt: string
}

export interface PlayerStats {
  gamesPlayed: number
  optimalGames: number
  bestSteps: number | null
  bestTimeSeconds: number | null
  recentResults: GameResult[]
}

const EMPTY_STATS: PlayerStats = {
  gamesPlayed: 0,
  optimalGames: 0,
  bestSteps: null,
  bestTimeSeconds: null,
  recentResults: [],
}

export function readPlayerStats(storage: Storage = window.localStorage): PlayerStats {
  const saved = storage.getItem(STORAGE_KEY)
  if (!saved) return { ...EMPTY_STATS }

  try {
    const parsed: unknown = JSON.parse(saved)
    if (!isPlayerStats(parsed)) throw new Error('Stored ReelLink statistics have an invalid shape.')
    return parsed
  } catch (error) {
    storage.removeItem(STORAGE_KEY)
    if (error instanceof SyntaxError) return { ...EMPTY_STATS }
    if (error instanceof Error && error.message.startsWith('Stored ReelLink')) {
      return { ...EMPTY_STATS }
    }
    throw error
  }
}

export function recordGameResult(
  storage: Storage,
  result: GameResult,
): PlayerStats {
  const previous = readPlayerStats(storage)
  const optimal = result.steps === result.shortestSteps
  const isBetter = previous.bestSteps === null
    || result.steps < previous.bestSteps
    || (result.steps === previous.bestSteps
      && (previous.bestTimeSeconds === null || result.seconds < previous.bestTimeSeconds))
  const updated: PlayerStats = {
    gamesPlayed: previous.gamesPlayed + 1,
    optimalGames: previous.optimalGames + Number(optimal),
    bestSteps: isBetter ? result.steps : previous.bestSteps,
    bestTimeSeconds: isBetter ? result.seconds : previous.bestTimeSeconds,
    recentResults: [result, ...previous.recentResults].slice(0, 20),
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

function isPlayerStats(value: unknown): value is PlayerStats {
  if (typeof value !== 'object' || value === null) return false
  const stats = value as Partial<PlayerStats>
  return Number.isInteger(stats.gamesPlayed)
    && Number.isInteger(stats.optimalGames)
    && (stats.bestSteps === null || Number.isInteger(stats.bestSteps))
    && (stats.bestTimeSeconds === null || Number.isInteger(stats.bestTimeSeconds))
    && Array.isArray(stats.recentResults)
    && stats.recentResults.every(isGameResult)
}

function isGameResult(value: unknown): value is GameResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<GameResult>
  return Number.isInteger(result.steps)
    && Number.isInteger(result.shortestSteps)
    && Number.isInteger(result.seconds)
    && typeof result.completedAt === 'string'
}
