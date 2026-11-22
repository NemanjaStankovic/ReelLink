import { describe, expect, it } from 'vitest'
import { selectPuzzleHint, selectPuzzleHints } from './hints.js'
import type { CatalogEntity } from '../api/types.js'

const movie = (id: string, popularity: number): CatalogEntity => ({
  id, kind: 'movie', name: `Film ${id}`, year: null, imageUrl: null, description: '', popularity,
})

const actor = (id: string, popularity: number): CatalogEntity => ({
  id, kind: 'actor', name: `Actor ${id}`, year: null, imageUrl: null, description: '', popularity,
})

describe('selectPuzzleHint', () => {
  it('suggests the most popular film for an actor destination', () => {
    expect(selectPuzzleHint(actor('1', 1), [movie('2', 4), movie('3', 10)]))
      .toMatchObject({ kind: 'popular-film', entity: { id: '3' } })
  })

  it('suggests the first cast member for a movie destination', () => {
    expect(selectPuzzleHint(movie('1', 1), [movie('2', 20), actor('3', 2), actor('4', 9)]))
      .toMatchObject({ kind: 'top-billed-actor', entity: { id: '3' } })
  })

  it('returns no hint when the destination has no matching credits', () => {
    expect(selectPuzzleHint(actor('1', 1), [actor('2', 2)])).toBeNull()
    expect(selectPuzzleHint(movie('1', 1), [movie('2', 2)])).toBeNull()
  })

  it('returns the five most popular films for an actor destination', () => {
    const connections = Array.from({ length: 7 }, (_, index) => movie(`${index + 2}`, index + 1))
    expect(selectPuzzleHints(actor('1', 1), [...connections, actor('9', 20)]))
      .toMatchObject([
        { kind: 'popular-film', entity: { id: '8' } },
        { kind: 'popular-film', entity: { id: '7' } },
        { kind: 'popular-film', entity: { id: '6' } },
        { kind: 'popular-film', entity: { id: '5' } },
        { kind: 'popular-film', entity: { id: '4' } },
      ])
  })

  it('returns the first five billed actors for a movie destination', () => {
    const connections = Array.from({ length: 7 }, (_, index) => actor(`${index + 2}`, 20 - index))
    expect(selectPuzzleHints(movie('1', 1), [movie('9', 30), ...connections]))
      .toMatchObject([
        { kind: 'top-billed-actor', entity: { id: '2' } },
        { kind: 'top-billed-actor', entity: { id: '3' } },
        { kind: 'top-billed-actor', entity: { id: '4' } },
        { kind: 'top-billed-actor', entity: { id: '5' } },
        { kind: 'top-billed-actor', entity: { id: '6' } },
      ])
  })
})
