import type { CatalogEntity } from '../api/types.js'
import { getHigherDifficulty } from './difficulty.js'
import type { CardQuality } from './difficulty.js'

const STORAGE_KEY = 'reellink.collection.v1'

export interface CollectedCard {
  entity: CatalogEntity
  correctGuesses: number
  firstGuessedAt: string
  lastGuessedAt: string
  bestDifficulty: CardQuality
}

export function readCollection(storage: Storage = window.localStorage): CollectedCard[] {
  const saved = storage.getItem(STORAGE_KEY)
  if (!saved) return []

  try {
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.every(isStoredCollectedCard)) {
      throw new Error('Stored ReelLink collection has an invalid shape.')
    }
    return parsed.map((card) => ({ ...card, bestDifficulty: card.bestDifficulty ?? 'bronze' }))
  } catch (error) {
    storage.removeItem(STORAGE_KEY)
    if (error instanceof SyntaxError) return []
    if (error instanceof Error && error.message.startsWith('Stored ReelLink')) return []
    throw error
  }
}

export function recordCorrectGuess(
  storage: Storage,
  entity: CatalogEntity,
  difficulty: CardQuality,
  guessedAt = new Date().toISOString(),
): CollectedCard[] {
  const collection = readCollection(storage)
  const cardIndex = collection.findIndex((card) =>
    card.entity.kind === entity.kind && card.entity.id === entity.id,
  )

  const updated = [...collection]
  if (cardIndex === -1) {
    updated.push({
      entity,
      correctGuesses: 1,
      firstGuessedAt: guessedAt,
      lastGuessedAt: guessedAt,
      bestDifficulty: difficulty,
    })
  } else {
    const previous = updated[cardIndex]
    updated[cardIndex] = {
      ...previous,
      entity,
      correctGuesses: previous.correctGuesses + 1,
      lastGuessedAt: guessedAt,
      bestDifficulty: getHigherDifficulty(previous.bestDifficulty, difficulty),
    }
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

type StoredCollectedCard = Omit<CollectedCard, 'bestDifficulty'> & { bestDifficulty?: CardQuality }

function isStoredCollectedCard(value: unknown): value is StoredCollectedCard {
  if (typeof value !== 'object' || value === null) return false
  const card = value as Partial<StoredCollectedCard>
  return isCatalogEntity(card.entity)
    && Number.isInteger(card.correctGuesses)
    && (card.correctGuesses ?? 0) > 0
    && typeof card.firstGuessedAt === 'string'
    && typeof card.lastGuessedAt === 'string'
    && (card.bestDifficulty === undefined
      || card.bestDifficulty === 'bronze'
      || card.bestDifficulty === 'silver'
      || card.bestDifficulty === 'gold'
      || card.bestDifficulty === 'unranked')
}

function isCatalogEntity(value: unknown): value is CatalogEntity {
  if (typeof value !== 'object' || value === null) return false
  const entity = value as Partial<CatalogEntity>
  return typeof entity.id === 'string'
    && (entity.kind === 'movie' || entity.kind === 'tv' || entity.kind === 'actor')
    && typeof entity.name === 'string'
    && (entity.year === null || typeof entity.year === 'string')
    && (entity.imageUrl === null || typeof entity.imageUrl === 'string')
    && typeof entity.description === 'string'
    && typeof entity.popularity === 'number'
    && (entity.rating === undefined || entity.rating === null || typeof entity.rating === 'number')
    && (entity.knownFor === undefined || typeof entity.knownFor === 'string')
    && (entity.character === undefined || entity.character === null || typeof entity.character === 'string')
}
