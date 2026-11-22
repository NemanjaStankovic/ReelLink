import { randomUUID } from 'node:crypto'
import { buildGraph, findShortestDistances } from '../../src/game/graph.js'
import { getDifficultyTier } from '../../src/game/difficulty.js'
import type { DifficultyTier } from '../../src/game/difficulty.js'
import type { Credit, EntityKind, GameEntity } from '../../src/game/model.js'
import type { CatalogEntity, Puzzle } from '../../src/api/types.js'

interface PuzzleCatalog {
  getTrendingMovies(): Promise<CatalogEntity[]>
  getConnections(kind: EntityKind, id: string): Promise<CatalogEntity[]>
}

interface PuzzleCandidate {
  start: CatalogEntity
  target: CatalogEntity
  steps: number
}

const SEED_MOVIE_LIMIT = 4
const SEED_ACTOR_LIMIT = 3
const EXPANSION_BATCH_LIMIT = 2
const MAX_EXPANSION_ROUNDS = 4

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

function chooseRequestedDifficulty(): DifficultyTier {
  const roll = Math.random()
  if (roll < 0.55) return 'bronze'
  if (roll < 0.9) return 'silver'
  return 'gold'
}

function findCandidatesByDifficulty(
  nodes: CatalogEntity[],
  credits: Credit[],
): Partial<Record<DifficultyTier, PuzzleCandidate>> {
  const graphCredits = credits.map(({ movieId, actorId }) => ({
    movieId: `movie:${movieId}`,
    actorId: `actor:${actorId}`,
  }))
  const graph = buildGraph(nodes.map(asGameEntity), graphCredits)
  const candidates: Partial<Record<DifficultyTier, PuzzleCandidate>> = {}
  const counts: Record<DifficultyTier, number> = { bronze: 0, silver: 0, gold: 0 }

  for (let startIndex = 0; startIndex < nodes.length; startIndex++) {
    const start = nodes[startIndex]
    const distances = findShortestDistances(graph, entityKey(start))
    for (let targetIndex = startIndex + 1; targetIndex < nodes.length; targetIndex++) {
      const target = nodes[targetIndex]
      const steps = distances.get(entityKey(target))
      if (steps === undefined) continue
      const tier = getDifficultyTier(steps)
      if (!tier) continue

      counts[tier]++
      if (Math.random() < 1 / counts[tier]) candidates[tier] = { start, target, steps }
    }
  }

  return candidates
}

function chooseAvailableCandidate(
  candidates: Partial<Record<DifficultyTier, PuzzleCandidate>>,
  requestedDifficulty: DifficultyTier,
): PuzzleCandidate | undefined {
  const fallbackOrder: Record<DifficultyTier, DifficultyTier[]> = {
    bronze: ['bronze', 'silver', 'gold'],
    silver: ['silver', 'bronze', 'gold'],
    gold: ['gold', 'silver', 'bronze'],
  }
  for (const tier of fallbackOrder[requestedDifficulty]) {
    if (candidates[tier]) return candidates[tier]
  }
  return undefined
}

export class PuzzleService {
  constructor(private readonly catalog: PuzzleCatalog) {}

  async createRandomPuzzle(): Promise<Puzzle> {
    const requestedDifficulty = chooseRequestedDifficulty()
    const seedMovies = shuffled(await this.catalog.getTrendingMovies()).slice(0, SEED_MOVIE_LIMIT)
    const entities = new Map<string, CatalogEntity>()
    const credits: Credit[] = []
    const creditKeys = new Set<string>()
    const expandedMovieIds = new Set<string>()
    const expandedActorIds = new Set<string>()

    const addCredit = (movieId: string, actorId: string) => {
      const key = `${movieId}:${actorId}`
      if (creditKeys.has(key)) return
      creditKeys.add(key)
      credits.push({ movieId, actorId })
    }

    const expandMovies = async (movies: CatalogEntity[]): Promise<CatalogEntity[]> => {
      const pending = movies.filter((movie) => !expandedMovieIds.has(movie.id))
      pending.forEach((movie) => expandedMovieIds.add(movie.id))
      const casts = await Promise.all(pending.map(async (movie) => ({
        movie,
        cast: await this.catalog.getConnections('movie', movie.id),
      })))
      const actors = new Map<string, CatalogEntity>()
      for (const { movie, cast } of casts) {
        entities.set(entityKey(movie), movie)
        for (const actor of cast) {
          entities.set(entityKey(actor), actor)
          actors.set(entityKey(actor), actor)
          addCredit(movie.id, actor.id)
        }
      }
      return [...actors.values()]
    }

    const expandActors = async (actors: CatalogEntity[]): Promise<CatalogEntity[]> => {
      const pending = actors.filter((actor) => !expandedActorIds.has(actor.id))
      pending.forEach((actor) => expandedActorIds.add(actor.id))
      const filmographies = await Promise.all(pending.map(async (actor) => ({
        actor,
        movies: await this.catalog.getConnections('actor', actor.id),
      })))
      const movies = new Map<string, CatalogEntity>()
      for (const { actor, movies: filmography } of filmographies) {
        entities.set(entityKey(actor), actor)
        for (const movie of filmography) {
          entities.set(entityKey(movie), movie)
          movies.set(entityKey(movie), movie)
          addCredit(movie.id, actor.id)
        }
      }
      return [...movies.values()]
    }

    const seedActors = await expandMovies(seedMovies)
    const seedActorsToExpand = shuffled(seedActors).slice(0, SEED_ACTOR_LIMIT)
    let movieFrontier = await expandActors(seedActorsToExpand)
    let candidates = findCandidatesByDifficulty([...entities.values()], credits)

    for (let round = 0; round < MAX_EXPANSION_ROUNDS; round++) {
      if (requestedDifficulty !== 'gold' && candidates[requestedDifficulty]) break
      const moviesToExpand = shuffled(movieFrontier.filter((movie) => !expandedMovieIds.has(movie.id)))
        .slice(0, EXPANSION_BATCH_LIMIT)
      if (moviesToExpand.length === 0) break

      const discoveredActors = await expandMovies(moviesToExpand)
      candidates = findCandidatesByDifficulty([...entities.values()], credits)
      if ((requestedDifficulty !== 'gold' && candidates[requestedDifficulty])
        || round === MAX_EXPANSION_ROUNDS - 1) break

      const actorsToExpand = shuffled(discoveredActors.filter((actor) => !expandedActorIds.has(actor.id)))
        .slice(0, EXPANSION_BATCH_LIMIT)
      if (actorsToExpand.length === 0) break
      movieFrontier = await expandActors(actorsToExpand)
      candidates = findCandidatesByDifficulty([...entities.values()], credits)
      if (requestedDifficulty !== 'gold' && candidates[requestedDifficulty]) break
    }

    const nodes = [...entities.values()]
    const selected = chooseAvailableCandidate(candidates, requestedDifficulty)
    if (!selected) {
      throw new Error('TMDB did not provide enough connected credits to create a puzzle.')
    }
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
        edges: credits,
      },
    }
  }
}
