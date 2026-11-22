export type EntityKind = 'movie' | 'actor'

export interface GameEntity {
  id: string
  kind: EntityKind
  name: string
}

export interface Credit {
  movieId: string
  actorId: string
}

export interface GameGraph {
  entities: ReadonlyMap<string, GameEntity>
  neighbors: ReadonlyMap<string, ReadonlySet<string>>
}

export interface PathResult {
  entities: GameEntity[]
  steps: number
}
