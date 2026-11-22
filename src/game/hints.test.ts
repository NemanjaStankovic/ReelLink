import { describe, expect, it } from 'vitest'
import { selectPuzzleHint } from './hints.js'
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
})
