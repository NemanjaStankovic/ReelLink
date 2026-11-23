import { describe, expect, it, vi } from 'vitest'
import { TmdbCatalog } from './tmdbCatalog.js'
import { TmdbClient } from './tmdbClient.js'

describe('TmdbCatalog actor connections', () => {
  it('uses combined acting credits, deduplicates media separately, and ranks by popularity', async () => {
    const tmdb = new TmdbClient()
    const get = vi.spyOn(tmdb, 'get').mockImplementation(async <T>(path: string) => {
      expect(path).toBe('/person/42/combined_credits')
      return {
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
      } as T
    })

    const connections = await new TmdbCatalog(tmdb).getConnections('actor', '42')

    expect(get).toHaveBeenCalledTimes(1)
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
    vi.spyOn(tmdb, 'get').mockImplementation(async <T>() => ({
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
    } as T))

    const connections = await new TmdbCatalog(tmdb).getConnections('actor', '42')

    expect(connections).toHaveLength(20)
    expect(connections.filter(({ kind }) => kind === 'tv')).toHaveLength(15)
    expect(connections.filter(({ kind }) => kind === 'movie')).toHaveLength(5)
    expect(connections[0]).toMatchObject({ kind: 'tv', name: 'Series 0', popularity: 100 })
    expect(connections.at(15)).toMatchObject({ kind: 'movie', name: 'Film 0', popularity: 10 })
    expect(connections.at(-1)).toMatchObject({ kind: 'movie', name: 'Film 4', popularity: 6 })
  })

  it('loads TV series details and cast for selectable TV credits', async () => {
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
      if (path === '/tv/17/credits') {
        return {
          cast: [{ id: 42, name: 'Actor', character: 'Lead' }],
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
      { kind: 'actor', id: '42', name: 'Actor' },
    ])
    expect(get.mock.calls.map(([path]) => path)).toEqual(['/tv/17', '/tv/17/credits'])
  })
})
