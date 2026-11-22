import { describe, expect, it } from 'vitest'
import { buildGraph, findShortestPath } from '../../src/game/graph.js'
import type { GameEntity } from '../../src/game/model.js'
import type { CatalogEntity } from '../../src/api/types.js'
import { PuzzleService } from './puzzleService.js'

const movie = (id: string, name: string): CatalogEntity => ({
  id, kind: 'movie', name, year: null, imageUrl: null, description: '', popularity: 1,
})
const actor = (id: string, name: string): CatalogEntity => ({
  id, kind: 'actor', name, year: null, imageUrl: null, description: '', popularity: 1,
})

describe('PuzzleService', () => {
  it('creates a connected puzzle whose shortest distance matches its returned graph', async () => {
    const movies = [movie('1', 'Film One'), movie('2', 'Film Two'), movie('3', 'Film Three')]
    const actors = [actor('10', 'Actor One'), actor('20', 'Actor Two'), actor('30', 'Actor Three')]
    const casts = new Map([
      ['1', [actors[0]]],
      ['2', [actors[0], actors[1]]],
      ['3', [actors[1], actors[2]]],
    ])
    const filmographies = new Map([
      ['10', [movies[0], movies[1]]],
      ['20', [movies[1], movies[2]]],
      ['30', [movies[2]]],
    ])
    const service = new PuzzleService({
      getTrendingMovies: async () => movies,
      getConnections: async (kind, id) => kind === 'movie'
        ? casts.get(id) ?? []
        : filmographies.get(id) ?? [],
    })

    const puzzle = await service.createRandomPuzzle()
    const entities: GameEntity[] = puzzle.graph.nodes.map((entity) => ({
      id: `${entity.kind}:${entity.id}`,
      kind: entity.kind,
      name: entity.name,
    }))
    const graph = buildGraph(
      entities,
      puzzle.graph.edges.map(({ movieId, actorId }) => ({
        movieId: `movie:${movieId}`,
        actorId: `actor:${actorId}`,
      })),
    )
    const shortest = findShortestPath(
      graph,
      `${puzzle.start.kind}:${puzzle.start.id}`,
      `${puzzle.target.kind}:${puzzle.target.id}`,
    )

    expect(shortest?.steps).toBe(puzzle.shortestSteps)
    expect(puzzle.shortestSteps).toBeGreaterThanOrEqual(2)
    expect(puzzle.start.id).not.toBe(puzzle.target.id)
  })
})
