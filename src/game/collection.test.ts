import { describe, expect, it } from 'vitest'
import { readCollection, recordCorrectGuess } from './collection.js'
import type { CatalogEntity } from '../api/types.js'

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

const entity = (kind: CatalogEntity['kind'], id: string): CatalogEntity => ({
  id,
  kind,
  name: `${kind} ${id}`,
  year: null,
  imageUrl: null,
  description: '',
  popularity: 1,
})

describe('local player collection', () => {
  it('stores unique movie and actor cards and increments correct guesses', () => {
    const storage = createStorage()
    const film = entity('movie', '1')
    const actor = entity('actor', '1')

    recordCorrectGuess(storage, film, 'bronze', '2026-01-01T00:00:00.000Z')
    recordCorrectGuess(storage, actor, 'silver', '2026-01-02T00:00:00.000Z')
    const collection = recordCorrectGuess(storage, film, 'bronze', '2026-01-03T00:00:00.000Z')

    expect(collection).toHaveLength(2)
    expect(collection.find((card) => card.entity.kind === 'movie')).toMatchObject({
      correctGuesses: 2,
      firstGuessedAt: '2026-01-01T00:00:00.000Z',
      lastGuessedAt: '2026-01-03T00:00:00.000Z',
      bestDifficulty: 'bronze',
    })
    expect(readCollection(storage)).toEqual(collection)
  })

  it('keeps the highest difficulty earned and upgrades legacy cards as they are guessed', () => {
    const storage = createStorage()
    const film = entity('movie', '1')
    storage.setItem('reellink.collection.v1', JSON.stringify([{
      entity: film,
      correctGuesses: 2,
      firstGuessedAt: '2026-01-01T00:00:00.000Z',
      lastGuessedAt: '2026-01-02T00:00:00.000Z',
    }]))

    expect(readCollection(storage)[0].bestDifficulty).toBe('bronze')
    recordCorrectGuess(storage, film, 'silver', '2026-01-03T00:00:00.000Z')
    const collection = recordCorrectGuess(storage, film, 'bronze', '2026-01-04T00:00:00.000Z')

    expect(collection[0]).toMatchObject({ correctGuesses: 4, bestDifficulty: 'silver' })
  })

  it('upgrades a collection card when a higher tier is earned', () => {
    const storage = createStorage()
    const film = entity('movie', '1')
    recordCorrectGuess(storage, film, 'silver')

    expect(recordCorrectGuess(storage, film, 'gold')[0].bestDifficulty).toBe('gold')
  })

  it('stores grayscale completions and upgrades them when a colored tier is earned', () => {
    const storage = createStorage()
    const film = entity('movie', '1')
    recordCorrectGuess(storage, film, 'unranked')
    expect(readCollection(storage)[0].bestDifficulty).toBe('unranked')

    const collection = recordCorrectGuess(storage, film, 'silver')
    expect(collection[0]).toMatchObject({ correctGuesses: 2, bestDifficulty: 'silver' })
  })

  it('resets malformed stored collection data', () => {
    const storage = createStorage()
    storage.setItem('reellink.collection.v1', '{malformed')

    expect(readCollection(storage)).toEqual([])
    expect(storage.getItem('reellink.collection.v1')).toBeNull()
  })
})
