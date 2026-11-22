import type { CatalogEntity, Puzzle } from './types.js'
import type { EntityKind } from '../game/model.js'

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = await response.json() as { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? 'The request could not be completed.')
  }
  return body as T
}

export const getRandomPuzzle = (): Promise<Puzzle> =>
  request<Puzzle>('/api/puzzles/random')

export const getConnections = (
  kind: EntityKind,
  id: string,
): Promise<{ entity: CatalogEntity; connections: CatalogEntity[] }> =>
  request(`/api/entities/${kind}/${encodeURIComponent(id)}/connections`)
