import { describe, expect, it, vi } from 'vitest'
import { buildGraph, findShortestDistances, findShortestPath } from '../../src/game/graph.js'
import type { GameEntity } from '../../src/game/model.js'
import type { CatalogEntity } from '../../src/api/types.js'
import { PuzzleService } from './puzzleService.js'

const movie = (id: string, name: string): CatalogEntity => ({
  id, kind: 'movie', name, year: null, imageUrl: null, description: '', popularity: 1,
})
const tv = (id: string, name: string): CatalogEntity => ({
  id, kind: 'tv', name, year: null, imageUrl: null, description: '', popularity: 1,
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
      puzzle.graph.edges,
    )
    const shortest = findShortestPath(
      graph,
      `${puzzle.start.kind}:${puzzle.start.id}`,
      `${puzzle.target.kind}:${puzzle.target.id}`,
    )

    expect(shortest?.steps).toBe(puzzle.shortestSteps)
    expect(puzzle.shortestSteps).toBeGreaterThanOrEqual(2)
    expect(puzzle.shortestSteps).toBeLessThanOrEqual(9)
    expect(puzzle.start.id).not.toBe(puzzle.target.id)
  })

  it('expands credits enough to support a nine-transition route for Gold puzzles', async () => {
    const movies = Array.from({ length: 3 }, (_, index) => movie(`${index}`, `Film ${index}`))
    const series = Array.from({ length: 2 }, (_, index) => tv(`${index}`, `Series ${index}`))
    const actors = Array.from({ length: 5 }, (_, index) => actor(`${index}`, `Actor ${index}`))
    const getConnections = vi.fn(async (kind: CatalogEntity['kind'], id: string) => {
      if (kind === 'movie') return actors[Number(id) * 2] ? [actors[Number(id) * 2]] : []
      if (kind === 'tv') return actors[Number(id) * 2 + 1] ? [actors[Number(id) * 2 + 1]] : []
      const mediaByActor = [series[0], movies[1], series[1], movies[2]]
      return mediaByActor[Number(id)] ? [mediaByActor[Number(id)]] : []
    })
    const service = new PuzzleService({
      getTrendingMovies: async () => [movies[0]],
      getConnections,
    })
    const random = vi.spyOn(Math, 'random').mockImplementationOnce(() => 0.95).mockReturnValue(0)

    try {
      const puzzle = await service.createRandomPuzzle()
      const graph = buildGraph(
        puzzle.graph.nodes.map((entity) => ({
          id: `${entity.kind}:${entity.id}`,
          kind: entity.kind,
          name: entity.name,
        })),
        puzzle.graph.edges,
      )

      expect(findShortestDistances(graph, 'movie:0').get('actor:4')).toBe(9)
      expect(getConnections.mock.calls.some(([kind]) => kind === 'tv')).toBe(true)
      expect(puzzle.graph.edges.some(({ mediaKind }) => mediaKind === 'tv')).toBe(true)
      expect(puzzle.shortestSteps).toBeGreaterThanOrEqual(7)
      expect(puzzle.shortestSteps).toBeLessThanOrEqual(9)
    } finally {
      random.mockRestore()
    }
  })
})
