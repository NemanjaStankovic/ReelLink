import type { Credit, GameEntity, GameGraph, PathResult } from './model.js'

export function buildGraph(entities: GameEntity[], credits: Credit[]): GameGraph {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]))
  const neighbors = new Map<string, Set<string>>()

  for (const entity of entities) neighbors.set(entity.id, new Set())

  for (const { movieId, actorId } of credits) {
    const movie = entityMap.get(movieId)
    const actor = entityMap.get(actorId)
    if (!movie || !actor || movie.kind !== 'movie' || actor.kind !== 'actor') continue
    neighbors.get(movieId)!.add(actorId)
    neighbors.get(actorId)!.add(movieId)
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

export function isValidNextEntity(
  graph: GameGraph,
  path: GameEntity[],
  candidateId: string,
): boolean {
  if (path.length === 0) return false
  const current = path[path.length - 1]
  const candidate = graph.entities.get(candidateId)
  if (!candidate || candidate.kind === current.kind || path.some((entity) => entity.id === candidateId)) return false
  return graph.neighbors.get(current.id)?.has(candidateId) ?? false
}
