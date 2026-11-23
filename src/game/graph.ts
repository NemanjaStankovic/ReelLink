import type { Credit, GameEntity, GameGraph, PathResult } from './model.js'

export function buildGraph(entities: GameEntity[], credits: Credit[]): GameGraph {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]))
  const neighbors = new Map<string, Set<string>>()

  for (const entity of entities) neighbors.set(entity.id, new Set())

  for (const { movieId, actorId, mediaKind = 'movie' } of credits) {
    const movie = entityMap.get(`${mediaKind}:${movieId}`) ?? entityMap.get(movieId)
    const actor = entityMap.get(actorId) ?? entityMap.get(`actor:${actorId}`)
    if (!movie || !actor || (movie.kind !== 'movie' && movie.kind !== 'tv') || actor.kind !== 'actor') continue
    neighbors.get(movie.id)!.add(actor.id)
    neighbors.get(actor.id)!.add(movie.id)
  }

  return { entities: entityMap, neighbors }
}

export function findShortestPath(graph: GameGraph, startId: string, targetId: string): PathResult | null {
  if (!graph.entities.has(startId) || !graph.entities.has(targetId)) return null
  if (startId === targetId) return { entities: [graph.entities.get(startId)!], steps: 0 }

  const queue = [startId]
  const previous = new Map<string, string | null>([[startId, null]])

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const currentId = queue[cursor]
    for (const neighborId of graph.neighbors.get(currentId) ?? []) {
      if (previous.has(neighborId)) continue
      previous.set(neighborId, currentId)
      if (neighborId === targetId) {
        const path: string[] = []
        let pathId: string | null = targetId
        while (pathId !== null) {
          path.push(pathId)
          pathId = previous.get(pathId) ?? null
        }
        path.reverse()
        return { entities: path.map((id) => graph.entities.get(id)!), steps: path.length - 1 }
      }
      queue.push(neighborId)
    }
  }

  return null
}

export function findShortestDistances(graph: GameGraph, startId: string): Map<string, number> {
  if (!graph.entities.has(startId)) return new Map()

  const distances = new Map<string, number>([[startId, 0]])
  const queue = [startId]

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const currentId = queue[cursor]
    const nextDistance = distances.get(currentId)! + 1
    for (const neighborId of graph.neighbors.get(currentId) ?? []) {
      if (distances.has(neighborId)) continue
      distances.set(neighborId, nextDistance)
      queue.push(neighborId)
    }
  }

  return distances
}

export function isValidNextEntity(
  graph: GameGraph,
  path: GameEntity[],
  candidateId: string,
): boolean {
  if (path.length === 0) return false
  const current = path[path.length - 1]
  const candidate = graph.entities.get(candidateId)
  if (!candidate
    || (candidate.kind === 'actor') === (current.kind === 'actor')
    || path.some((entity) => entity.id === candidateId)) return false
  return graph.neighbors.get(current.id)?.has(candidateId) ?? false
}
