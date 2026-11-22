import { describe, expect, it } from 'vitest'
import { buildGraph, findShortestPath, isValidNextEntity } from './graph.js'
import type { Credit, GameEntity } from './model.js'

const entities: GameEntity[] = [
  { id: 'm1', kind: 'movie', name: 'Film One' },
  { id: 'a1', kind: 'actor', name: 'Actor One' },
  { id: 'm2', kind: 'movie', name: 'Film Two' },
  { id: 'a2', kind: 'actor', name: 'Actor Two' },
  { id: 'm3', kind: 'movie', name: 'Film Three' },
  { id: 'a3', kind: 'actor', name: 'Actor Three' },
  { id: 'isolated', kind: 'movie', name: 'No Credits' },
]
const credits: Credit[] = [
  { movieId: 'm1', actorId: 'a1' },
  { movieId: 'm2', actorId: 'a1' },
  { movieId: 'm2', actorId: 'a2' },
  { movieId: 'm3', actorId: 'a2' },
  { movieId: 'm3', actorId: 'a3' },
]
const graph = buildGraph(entities, credits)

describe('findShortestPath', () => {
  it.each([
    ['movie', 'm1', 'm3', 4],
    ['actor', 'a1', 'a3', 4],
    ['movie to actor', 'm1', 'a3', 5],
    ['actor to movie', 'a1', 'm3', 3],
  ])('finds shortest paths for %s endpoints', (_label, start, target, steps) => {
    expect(findShortestPath(graph, start, target)?.steps).toBe(steps)
  })

  it('returns a zero-step path for the same entity', () => {
    expect(findShortestPath(graph, 'm1', 'm1')).toMatchObject({ steps: 0, entities: [entities[0]] })
  })

  it('returns null for missing or unreachable entities', () => {
    expect(findShortestPath(graph, 'm1', 'isolated')).toBeNull()
    expect(findShortestPath(graph, 'm1', 'missing')).toBeNull()
  })

  it('does not revisit entities when traversing cycles', () => {
    const cyclicGraph = buildGraph(
      [...entities, { id: 'a4', kind: 'actor', name: 'Actor Four' }],
      [...credits, { movieId: 'm1', actorId: 'a4' }, { movieId: 'm2', actorId: 'a4' }],
    )
    expect(findShortestPath(cyclicGraph, 'a1', 'a3')?.steps).toBe(4)
  })
})

describe('isValidNextEntity', () => {
  it('allows only connected, alternating, unvisited entities', () => {
    expect(isValidNextEntity(graph, [entities[0]], 'a1')).toBe(true)
    expect(isValidNextEntity(graph, [entities[0]], 'm2')).toBe(false)
    expect(isValidNextEntity(graph, [entities[0]], 'a2')).toBe(false)
    expect(isValidNextEntity(graph, [entities[0], entities[1]], 'm1')).toBe(false)
  })
})
