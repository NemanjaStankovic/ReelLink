import type { EntityKind } from '../game/model.js'

export interface CatalogEntity {
  id: string
  kind: EntityKind
  name: string
  year: string | null
  imageUrl: string | null
  description: string
  popularity: number
  rating?: number | null
  knownFor?: string
}

export interface Puzzle {
  id: string
  source: 'random' | 'daily' | 'curated' | 'community'
  creatorId: string | null
  validationStatus: 'sampled' | 'validated' | 'unverified'
  publicationStatus: 'unpublished' | 'published' | 'archived'
  start: CatalogEntity
  target: CatalogEntity
  shortestSteps: number
  graph: {
    nodes: CatalogEntity[]
    edges: Array<{ movieId: string; actorId: string }>
  }
}
