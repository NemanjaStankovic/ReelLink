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

    recordCorrectGuess(storage, film, '2026-01-01T00:00:00.000Z')
    recordCorrectGuess(storage, actor, '2026-01-02T00:00:00.000Z')
    const collection = recordCorrectGuess(storage, film, '2026-01-03T00:00:00.000Z')

    expect(collection).toHaveLength(2)
    expect(collection.find((card) => card.entity.kind === 'movie')).toMatchObject({
      correctGuesses: 2,
      firstGuessedAt: '2026-01-01T00:00:00.000Z',
      lastGuessedAt: '2026-01-03T00:00:00.000Z',
    })
    expect(readCollection(storage)).toEqual(collection)
  })

  it('resets malformed stored collection data', () => {
    const storage = createStorage()
    storage.setItem('reellink.collection.v1', '{malformed')

    expect(readCollection(storage)).toEqual([])
    expect(storage.getItem('reellink.collection.v1')).toBeNull()
  })
})
