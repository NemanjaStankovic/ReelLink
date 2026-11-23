export type MediaKind = 'movie' | 'tv'
export type EntityKind = MediaKind | 'actor'

export interface GameEntity {
  id: string
  kind: EntityKind
  name: string
}

export interface Credit {
  movieId: string
  actorId: string
  mediaKind?: MediaKind
}

export interface GameGraph {
  entities: ReadonlyMap<string, GameEntity>
  neighbors: ReadonlyMap<string, ReadonlySet<string>>
}

export interface PathResult {
  entities: GameEntity[]
  steps: number
}
