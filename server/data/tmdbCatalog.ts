import type { EntityKind } from '../../src/game/model.js'
import type { CatalogEntity } from '../../src/api/types.js'
import { TmdbClient } from './tmdbClient.js'

interface TmdbMovie {
  id: number
  title: string
  release_date?: string
  poster_path?: string | null
  overview?: string
  popularity?: number
  media_type?: string
}

interface TmdbPerson {
  id: number
  name: string
  profile_path?: string | null
  popularity?: number
  known_for_department?: string
  known_for?: TmdbMovie[]
  biography?: string
  birthday?: string | null
}

interface TmdbCredits {
  cast?: Array<TmdbPerson & { character?: string }>
}

interface TmdbSearchResponse {
  results: Array<(TmdbMovie | TmdbPerson) & { media_type?: string }>
}

interface TmdbTrendingResponse {
  results: TmdbMovie[]
}

const imageUrl = (path?: string | null, size = 'w500'): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

const yearFromDate = (date?: string | null): string | null => date?.slice(0, 4) || null

const movieDto = (movie: TmdbMovie): CatalogEntity => ({
  id: String(movie.id),
  kind: 'movie',
  name: movie.title,
  year: yearFromDate(movie.release_date),
  imageUrl: imageUrl(movie.poster_path),
  description: movie.overview ?? '',
  popularity: movie.popularity ?? 0,
})

const personDto = (person: TmdbPerson): CatalogEntity => ({
  id: String(person.id),
  kind: 'actor',
  name: person.name,
  year: yearFromDate(person.birthday),
  imageUrl: imageUrl(person.profile_path, 'w342'),
  description: person.biography ?? '',
  popularity: person.popularity ?? 0,
  ...(person.known_for_department ? { knownFor: person.known_for_department } : {}),
})

export class TmdbCatalog {
  constructor(private readonly tmdb: TmdbClient) {}

  async search(query: string): Promise<CatalogEntity[]> {
    const response = await this.tmdb.get<TmdbSearchResponse>('/search/multi', {
      query,
      include_adult: 'false',
    })
    return response.results.flatMap((result) => {
      if (result.media_type === 'movie' && 'title' in result) return [movieDto(result)]
      if (result.media_type === 'person' && 'name' in result) return [personDto(result)]
      return []
    })
  }

  async getEntity(kind: EntityKind, id: string): Promise<CatalogEntity> {
    if (kind === 'movie') {
      return movieDto(await this.tmdb.get<TmdbMovie>(`/movie/${id}`))
    }
    return personDto(await this.tmdb.get<TmdbPerson>(`/person/${id}`))
  }

  async getConnections(kind: EntityKind, id: string): Promise<CatalogEntity[]> {
    if (kind === 'movie') {
      const response = await this.tmdb.get<TmdbCredits>(`/movie/${id}/credits`)
      return (response.cast ?? []).slice(0, 20).map(personDto)
    }

    const response = await this.tmdb.get<{ cast?: TmdbMovie[] }>(`/person/${id}/movie_credits`)
    const unique = new Map<number, TmdbMovie>()
    for (const movie of response.cast ?? []) {
      if (!unique.has(movie.id) || (movie.popularity ?? 0) > (unique.get(movie.id)?.popularity ?? 0)) {
        unique.set(movie.id, movie)
      }
    }
    return [...unique.values()]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 20)
      .map(movieDto)
  }

  async getTrendingMovies(): Promise<CatalogEntity[]> {
    const response = await this.tmdb.get<TmdbTrendingResponse>('/trending/movie/week')
    return response.results.map(movieDto)
  }
}
