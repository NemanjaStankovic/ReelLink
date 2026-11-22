export interface HintEntity {
  id: string
  kind: 'movie' | 'actor'
  popularity: number
}

export interface PuzzleHint<T extends HintEntity = HintEntity> {
  kind: 'popular-film' | 'top-billed-actor'
  entity: T
}

export function selectPuzzleHint<T extends HintEntity>(
  target: T,
  connections: T[],
): PuzzleHint<T> | null {
  if (target.kind === 'actor') {
    const popularFilm = connections
      .filter((entity) => entity.kind === 'movie')
      .sort((a, b) => b.popularity - a.popularity)[0]
    return popularFilm ? { kind: 'popular-film', entity: popularFilm } : null
  }

  const topBilledActor = connections.find((entity) => entity.kind === 'actor')
  return topBilledActor ? { kind: 'top-billed-actor', entity: topBilledActor } : null
}
