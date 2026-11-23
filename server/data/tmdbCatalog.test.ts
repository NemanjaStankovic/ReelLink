import { describe, expect, it, vi } from 'vitest'
import { selectPuzzleHints } from '../../src/game/hints.js'
import { TmdbCatalog } from './tmdbCatalog.js'
import { TmdbClient } from './tmdbClient.js'

describe('TmdbCatalog actor connections', () => {
  it('uses combined acting credits, deduplicates media separately, and ranks by popularity', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      const responses: Record<string, unknown> = {
        '/person/42/combined_credits': {
          cast: [
            {
              id: 7, media_type: 'movie', title: 'Film', popularity: 8,
              release_date: '2021-01-01', character: 'Alternate role',
            },
            {
              id: 7, media_type: 'movie', title: 'Film', popularity: 12,
              release_date: '2021-01-01', character: 'Lead',
            },
            {
              id: 7, media_type: 'tv', name: 'Series', popularity: 30,
              first_air_date: '2020-01-01', character: 'Detective',
            },
            {
              id: 8, media_type: 'movie', title: 'Popular Film', popularity: 45,
              release_date: '2024-01-01', character: 'Herself',
            },
            {
              id: 9, media_type: 'person', name: 'Crew member', popularity: 100,
            },
          ],
          crew: [{ id: 10, media_type: 'movie', title: 'Crew credit', popularity: 200 }],
        },
        '/movie/8/credits': { cast: [{ id: 42, name: 'Actor' }] },
        '/tv/7': { genres: [{ id: 18, name: 'Drama' }] },
        '/tv/7/aggregate_credits': {
          cast: [{ id: 42, name: 'Actor', roles: [{ character: 'Guest' }] }],
        },
        '/movie/7/credits': { cast: [{ id: 42, name: 'Actor' }] },
      }
      if (!(path in responses)) throw new Error(`Unexpected TMDB request: ${path}`)
      return responses[path] as T
    })

    const connections = await new TmdbCatalog(tmdb).getConnections('actor', '42')

    expect(get).toHaveBeenCalledTimes(5)
    expect(connections.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      'movie:8',
      'tv:7',
      'movie:7',
    ])
    expect(connections[1]).toMatchObject({
      name: 'Series',
      year: '2020',
      character: 'Detective',
    })
    expect(connections[2]).toMatchObject({ name: 'Film', popularity: 12, character: 'Lead' })
  })

  it('keeps popular credits from both media types when one type dominates the top 20', async () => {
    const tmdb = new TmdbClient()
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/person/42/combined_credits') {
        return {
          cast: [
            ...Array.from({ length: 24 }, (_, index) => ({
              id: index + 1,
              media_type: 'tv' as const,
              name: `Series ${index}`,
              popularity: 100 - index,
            })),
            ...Array.from({ length: 7 }, (_, index) => ({
              id: index + 1,
              media_type: 'movie' as const,
              title: `Film ${index}`,
              popularity: 10 - index,
            })),
          ],
        } as T
      }
      if (/^\/tv\/\d+$/.test(path)) {
        return { genres: [{ id: 18, name: 'Drama' }] } as T
      }
      if (path.endsWith('/aggregate_credits') || path.endsWith('/credits')) {
        return { cast: [{ id: 42, name: 'Actor' }] } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })

    const connections = await new TmdbCatalog(tmdb).getConnections('actor', '42')

    expect(connections).toHaveLength(20)
    expect(connections.filter(({ kind }) => kind === 'tv')).toHaveLength(15)
    expect(connections.filter(({ kind }) => kind === 'movie')).toHaveLength(5)
    expect(connections[0]).toMatchObject({ kind: 'tv', name: 'Series 0', popularity: 100 })
    expect(connections.at(15)).toMatchObject({ kind: 'movie', name: 'Film 0', popularity: 10 })
    expect(connections.at(-1)).toMatchObject({ kind: 'movie', name: 'Film 4', popularity: 6 })
  })

  it('does not expose or hint a combined TV credit absent from the selectable aggregate cast', async () => {
    const tmdb = new TmdbClient()
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/person/42/combined_credits') {
        return {
          cast: [{
            id: 17,
            media_type: 'tv',
            name: 'Series',
            popularity: 50,
            character: 'Guest',
          }],
        } as T
      }
      if (path === '/tv/17') {
        return { genres: [{ id: 18, name: 'Drama' }] } as T
      }
      if (path === '/tv/17/aggregate_credits') {
        return { cast: [{ id: 99, name: 'Different actor' }] } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })

    const connections = await new TmdbCatalog(tmdb).getConnections('actor', '42')

    expect(connections).toEqual([])
    expect(selectPuzzleHints({
      id: '42',
      kind: 'actor',
      name: 'Actor',
      year: null,
      imageUrl: null,
      description: '',
      popularity: 1,
    }, connections)).toEqual([])
  })

  it('keeps season-only guests playable without validating every season for actor credits', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/person/42/combined_credits') {
        return {
          cast: [{
            id: 17,
            media_type: 'tv',
            name: 'Series',
            popularity: 50,
            character: 'Guest',
          }],
        } as T
      }
      if (path === '/tv/17') {
        return {
          genres: [{ id: 18, name: 'Drama' }],
          seasons: [{ season_number: 1 }],
        } as T
      }
      if (path === '/tv/17/aggregate_credits') return { cast: [] } as T
      if (path === '/tv/17/season/1/aggregate_credits') {
        return {
          cast: [{
            id: 42,
            name: 'Actor',
            roles: [{ character: 'Guest' }],
          }],
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })
    const catalog = new TmdbCatalog(tmdb)

    await expect(catalog.getConnections('actor', '42')).resolves.toEqual([])
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/person/42/combined_credits',
      '/tv/17',
      '/tv/17/aggregate_credits',
    ])
    await expect(catalog.getConnections('tv', '17')).resolves.toMatchObject([
      { kind: 'actor', id: '42', name: 'Actor' },
    ])
    expect(get.mock.calls.at(-1)?.[0]).toBe('/tv/17/season/1/aggregate_credits')
  })

  it('excludes talk shows from actor hints and selectable TV cast', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/person/42/combined_credits') {
        return {
          cast: [{
            id: 17,
            media_type: 'tv',
            name: 'The Tonight Show',
            popularity: 50,
            genre_ids: [10767],
          }],
        } as T
      }
      if (path === '/tv/17') {
        return { genres: [{ id: 10767, name: 'Talk' }] } as T
      }
      if (path === '/tv/17/aggregate_credits') {
        return { cast: [{ id: 42, name: 'Actor' }] } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })
    const catalog = new TmdbCatalog(tmdb)

    const actorConnections = await catalog.getConnections('actor', '42')
    const tvConnections = await catalog.getConnections('tv', '17')

    expect(actorConnections).toEqual([])
    expect(selectPuzzleHints({
      id: '42',
      kind: 'actor',
      name: 'Actor',
      year: null,
      imageUrl: null,
      description: '',
      popularity: 1,
    }, actorConnections)).toEqual([])
    expect(tvConnections).toEqual([])
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/person/42/combined_credits',
      '/tv/17',
    ])
  })

  it('returns the full TV cast as playable connections', async () => {
    const tmdb = new TmdbClient()
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/tv/17') return { genres: [{ id: 18, name: 'Drama' }] } as T
      if (path === '/tv/17/aggregate_credits') {
        return {
          cast: Array.from({ length: 25 }, (_, index) => ({
            id: index + 1,
            name: `Actor ${index + 1}`,
            roles: [{ character: `Role ${index + 1}` }],
          })),
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })
    const catalog = new TmdbCatalog(tmdb)

    const cast = await catalog.getConnections('tv', '17')

    expect(cast).toHaveLength(25)
    expect(cast).toContainEqual(expect.objectContaining({ id: '25', name: 'Actor 25' }))
  })

  it('unions aggregate cast across seasons and merges each actor’s roles', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/tv/17') {
        return {
          genres: [{ id: 18, name: 'Drama' }],
          seasons: [{ season_number: 1 }, { season_number: 2 }],
        } as T
      }
      if (path === '/tv/17/aggregate_credits') {
        return {
          cast: [{ id: 1, name: 'Lead', popularity: 30, roles: [{ character: 'Lead role' }] }],
        } as T
      }
      if (path === '/tv/17/season/1/aggregate_credits') {
        return {
          cast: [
            { id: 1, name: 'Lead', popularity: 30, roles: [{ character: 'Lead role' }] },
            { id: 2, name: 'Guest', popularity: 10, roles: [{ character: 'Guest role' }] },
          ],
        } as T
      }
      if (path === '/tv/17/season/2/aggregate_credits') {
        return {
          cast: [
            { id: 2, name: 'Guest', popularity: 10, roles: [{ character: 'Guest role' }] },
            { id: 3, name: 'Recurring', popularity: 20, roles: [{ character: 'Recurring role' }] },
          ],
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })

    const cast = await new TmdbCatalog(tmdb).getConnections('tv', '17')

    expect(cast.map(({ id }) => id)).toEqual(['1', '3', '2'])
    expect(cast.find(({ id }) => id === '2')).toMatchObject({
      name: 'Guest',
      character: 'Guest role',
    })
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/tv/17',
      '/tv/17/aggregate_credits',
      '/tv/17/season/1/aggregate_credits',
      '/tv/17/season/2/aggregate_credits',
    ])
  })

  it('ranks TV regulars ahead of famous one-episode guest actors', async () => {
    const tmdb = new TmdbClient()
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/tv/456') {
        return {
          genres: [{ id: 16, name: 'Animation' }],
          seasons: [{ season_number: 1 }],
        } as T
      }
      if (path === '/tv/456/aggregate_credits') {
        return {
          cast: [
            {
              id: 1,
              name: 'Homer Simpson',
              popularity: 2,
              order: 0,
              total_episode_count: 700,
            },
            {
              id: 2,
              name: 'Anne Hathaway',
              popularity: 100,
              order: 30,
              total_episode_count: 1,
            },
          ],
        } as T
      }
      if (path === '/tv/456/season/1/aggregate_credits') {
        return {
          cast: [
            { id: 1, name: 'Homer Simpson', popularity: 2, order: 0, total_episode_count: 30 },
            { id: 2, name: 'Anne Hathaway', popularity: 100, order: 30, total_episode_count: 1 },
          ],
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })

    const cast = await new TmdbCatalog(tmdb).getConnections('tv', '456')

    expect(cast.slice(0, 2).map(({ name }) => name)).toEqual([
      'Homer Simpson',
      'Anne Hathaway',
    ])
  })

  it('limits puzzle connections to the ten highest-billed TV actors', async () => {
    const tmdb = new TmdbClient()
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/tv/789') return { genres: [] } as T
      if (path === '/tv/789/aggregate_credits') {
        return {
          cast: Array.from({ length: 12 }, (_, index) => ({
            id: index + 1,
            name: `Actor ${index + 1}`,
            order: index,
            popularity: index === 11 ? 100 : 1,
          })),
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })

    const cast = await new TmdbCatalog(tmdb).getPuzzleConnections('tv', '789')

    expect(cast.map(({ id }) => id)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    )
  })

  it('loads the aggregate TV cast, including episode roles, for selectable TV credits', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      if (path === '/tv/17') {
        return {
          id: 17,
          name: 'Series',
          first_air_date: '2022-01-01',
          overview: 'A series overview',
          popularity: 12,
        } as T
      }
      if (path === '/tv/17/aggregate_credits') {
        return {
          cast: [{
            id: 42,
            name: 'Actor',
            roles: [{ character: 'Guest', episode_count: 1 }],
            total_episode_count: 1,
          }],
        } as T
      }
      throw new Error(`Unexpected TMDB request: ${path}`)
    })
    const catalog = new TmdbCatalog(tmdb)

    await expect(catalog.getEntity('tv', '17')).resolves.toMatchObject({
      kind: 'tv',
      name: 'Series',
      year: '2022',
    })
    await expect(catalog.getConnections('tv', '17')).resolves.toMatchObject([
      { kind: 'actor', id: '42', name: 'Actor', character: 'Guest' },
    ])
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/tv/17',
      '/tv/17',
      '/tv/17/aggregate_credits',
    ])
  })
})
