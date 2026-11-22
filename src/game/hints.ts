export interface HintEntity {
  id: string
  kind: 'movie' | 'actor'
  popularity: number
}

export interface PuzzleHint<T extends HintEntity = HintEntity> {
  kind: 'popular-film' | 'top-billed-actor'
  entity: T
}

export function selectPuzzleHints<T extends HintEntity>(
  target: T,
  connections: T[],
): PuzzleHint<T>[] {
  const kind = target.kind === 'actor' ? 'popular-film' : 'top-billed-actor'
  const candidates = target.kind === 'actor'
    ? connections.filter((entity) => entity.kind === 'movie').sort((a, b) => b.popularity - a.popularity)
    : connections.filter((entity) => entity.kind === 'actor')

  return candidates.slice(0, 5).map((entity) => ({ kind, entity }))
}

export function selectPuzzleHint<T extends HintEntity>(
  target: T,
  connections: T[],
): PuzzleHint<T> | null {
  return selectPuzzleHints(target, connections)[0] ?? null
}
