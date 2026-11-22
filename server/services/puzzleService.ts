import { randomUUID } from 'node:crypto'
import { buildGraph, findShortestPath } from '../../src/game/graph.js'
import type { Credit, EntityKind, GameEntity } from '../../src/game/model.js'
import type { CatalogEntity, Puzzle } from '../../src/api/types.js'

interface PuzzleCatalog {
  getTrendingMovies(): Promise<CatalogEntity[]>
  getConnections(kind: EntityKind, id: string): Promise<CatalogEntity[]>
}

const shuffled = <T>(items: T[]): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

const entityKey = (entity: CatalogEntity): string => `${entity.kind}:${entity.id}`

const asGameEntity = (entity: CatalogEntity): GameEntity => ({
  id: entityKey(entity),
  kind: entity.kind,
  name: entity.name,
})

export class PuzzleService {
  constructor(private readonly catalog: PuzzleCatalog) {}

  async createRandomPuzzle(): Promise<Puzzle> {
    const seedMovies = shuffled(await this.catalog.getTrendingMovies()).slice(0, 4)
    const movieCast = await Promise.all(seedMovies.map(async (movie) => ({
      movie,
      cast: await this.catalog.getConnections('movie', movie.id),
    })))
    const entities = new Map<string, CatalogEntity>()
    const credits: Credit[] = []
    for (const { movie, cast } of movieCast) {
      entities.set(entityKey(movie), movie)
      for (const actor of cast) {
        entities.set(entityKey(actor), actor)
        credits.push({ movieId: movie.id, actorId: actor.id })
      }
    }

    const seedActors = shuffled([...entities.values()].filter((entity) => entity.kind === 'actor')).slice(0, 3)
    const filmographies = await Promise.all(seedActors.map(async (actor) => ({
      actor,
      movies: await this.catalog.getConnections('actor', actor.id),
    })))
    for (const { actor, movies } of filmographies) {
      for (const movie of movies) {
        entities.set(entityKey(movie), movie)
        credits.push({ movieId: movie.id, actorId: actor.id })
      }
    }

    const nodes = [...entities.values()]
    const graphCredits = credits.map(({ movieId, actorId }) => ({
      movieId: `movie:${movieId}`,
      actorId: `actor:${actorId}`,
    }))
    const graph = buildGraph(nodes.map(asGameEntity), graphCredits)
    const candidates: Array<{ start: CatalogEntity; target: CatalogEntity; steps: number }> = []

    for (let startIndex = 0; startIndex < nodes.length; startIndex++) {
      for (let targetIndex = startIndex + 1; targetIndex < nodes.length; targetIndex++) {
        const path = findShortestPath(graph, entityKey(nodes[startIndex]), entityKey(nodes[targetIndex]))
        if (path && path.steps >= 2 && path.steps <= 6) {
          candidates.push({ start: nodes[startIndex], target: nodes[targetIndex], steps: path.steps })
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error('TMDB did not provide enough connected credits to create a puzzle.')
    }
    const selected = candidates[Math.floor(Math.random() * candidates.length)]
    if (Math.random() < 0.5) [selected.start, selected.target] = [selected.target, selected.start]

    return {
      id: randomUUID(),
      source: 'random',
      creatorId: null,
      validationStatus: 'sampled',
      publicationStatus: 'unpublished',
      start: selected.start,
      target: selected.target,
      shortestSteps: selected.steps,
      graph: {
        nodes,
        edges: [...new Set(credits.map(({ movieId, actorId }) => `${movieId}:${actorId}`))]
          .map((key) => {
            const [movieId, actorId] = key.split(':')
            return { movieId, actorId }
          }),
      },
    }
  }
}
