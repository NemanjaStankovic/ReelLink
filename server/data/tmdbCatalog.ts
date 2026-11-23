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
  vote_average?: number
  media_type?: string
}

interface TmdbTv {
  id: number
  name: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  popularity?: number
  vote_average?: number
}

interface TmdbCombinedCredit {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  popularity?: number
  vote_average?: number
  character?: string
  order?: number
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

interface TmdbCombinedCredits {
  cast?: TmdbCombinedCredit[]
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
const MAX_ACTOR_CREDITS = 20
const MIN_ACTOR_CREDITS_PER_MEDIA_TYPE = 5

const compareCreditsByPopularity = (a: TmdbCombinedCredit, b: TmdbCombinedCredit) =>
  (b.popularity ?? 0) - (a.popularity ?? 0)
  || (b.vote_average ?? 0) - (a.vote_average ?? 0)
  || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)

const movieDto = (movie: TmdbMovie): CatalogEntity => ({
  id: String(movie.id),
  kind: 'movie',
  name: movie.title,
  year: yearFromDate(movie.release_date),
  imageUrl: imageUrl(movie.poster_path),
  description: movie.overview ?? '',
  popularity: movie.popularity ?? 0,
  rating: movie.vote_average ?? null,
})

const tvDto = (tv: TmdbTv): CatalogEntity => ({
  id: String(tv.id),
  kind: 'tv',
  name: tv.name,
  year: yearFromDate(tv.first_air_date),
  imageUrl: imageUrl(tv.poster_path),
  description: tv.overview ?? '',
  popularity: tv.popularity ?? 0,
  rating: tv.vote_average ?? null,
})

const combinedCreditDto = (credit: TmdbCombinedCredit): CatalogEntity => ({
  id: String(credit.id),
  kind: credit.media_type,
  name: credit.media_type === 'movie' ? credit.title ?? '' : credit.name ?? '',
  year: yearFromDate(credit.media_type === 'movie' ? credit.release_date : credit.first_air_date),
  imageUrl: imageUrl(credit.poster_path),
  description: credit.overview ?? '',
  popularity: credit.popularity ?? 0,
  rating: credit.vote_average ?? null,
  character: credit.character ?? null,
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
    if (kind === 'tv') {
      return tvDto(await this.tmdb.get<TmdbTv>(`/tv/${id}`))
    }
    return personDto(await this.tmdb.get<TmdbPerson>(`/person/${id}`))
  }

  async getConnections(kind: EntityKind, id: string): Promise<CatalogEntity[]> {
    if (kind === 'movie') {
      const response = await this.tmdb.get<TmdbCredits>(`/movie/${id}/credits`)
      return (response.cast ?? []).slice(0, 20).map(personDto)
    }
    if (kind === 'tv') {
      const response = await this.tmdb.get<TmdbCredits>(`/tv/${id}/credits`)
      return (response.cast ?? []).slice(0, 20).map(personDto)
    }

    const response = await this.tmdb.get<TmdbCombinedCredits>(`/person/${id}/combined_credits`)
    const unique = new Map<string, TmdbCombinedCredit>()
    for (const credit of response.cast ?? []) {
      if (credit.media_type !== 'movie' && credit.media_type !== 'tv') continue
      const key = `${credit.media_type}:${credit.id}`
      const existing = unique.get(key)
      if (!existing) {
        unique.set(key, credit)
        continue
      }
      const preferred = (credit.popularity ?? 0) > (existing.popularity ?? 0) ? credit : existing
      unique.set(key, {
        ...preferred,
        character: preferred.character || existing.character || credit.character,
      })
    }
    const rankedCredits = [...unique.values()].sort(compareCreditsByPopularity)
    const selectedCredits = new Map<string, TmdbCombinedCredit>()
    for (const mediaType of ['movie', 'tv'] as const) {
      for (const credit of rankedCredits
        .filter((item) => item.media_type === mediaType)
        .slice(0, MIN_ACTOR_CREDITS_PER_MEDIA_TYPE)) {
        selectedCredits.set(`${credit.media_type}:${credit.id}`, credit)
      }
    }
    for (const credit of rankedCredits) {
      if (selectedCredits.size >= MAX_ACTOR_CREDITS) break
      selectedCredits.set(`${credit.media_type}:${credit.id}`, credit)
    }
    return [...selectedCredits.values()]
      .sort(compareCreditsByPopularity)
      .map(combinedCreditDto)
  }

  async getTrendingMovies(): Promise<CatalogEntity[]> {
    const response = await this.tmdb.get<TmdbTrendingResponse>('/trending/movie/week')
    return response.results.map(movieDto)
  }
}
