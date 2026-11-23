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
  genres?: Array<{ id: number; name: string }>
  seasons?: Array<{ season_number: number; episode_count?: number }>
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
  genre_ids?: number[]
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

interface TmdbAggregateCastMember extends TmdbPerson {
  roles?: Array<{ character?: string; episode_count?: number }>
  order?: number
  total_episode_count?: number
}

interface TmdbAggregateCredits {
  cast?: TmdbAggregateCastMember[]
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
const TALK_TV_GENRE_ID = 10767

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

const aggregatePersonDto = (person: TmdbAggregateCastMember): CatalogEntity => ({
  ...personDto(person),
  character: person.roles
    ?.map((role) => role.character?.trim())
    .filter((character): character is string => Boolean(character))
    .join(', ') || null,
})

const compareAggregateCast = (a: TmdbAggregateCastMember, b: TmdbAggregateCastMember) =>
  (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0)
  || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
  || (b.popularity ?? 0) - (a.popularity ?? 0)

const compareBillingOrder = (a: TmdbAggregateCastMember, b: TmdbAggregateCastMember) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
  || compareAggregateCast(a, b)

const TV_PUZZLE_MAIN_CAST_LIMIT = 10

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
    if (kind !== 'actor') return this.getMediaCast(kind, id)
    return this.getActorConnections(id)
  }

  async getPuzzleConnections(kind: EntityKind, id: string): Promise<CatalogEntity[]> {
    if (kind === 'actor') return this.getActorConnections(id)
    if (kind === 'tv') {
      const cast = await this.getTvAggregateCast(id, false)
      return [...cast]
        .sort(compareBillingOrder)
        .slice(0, TV_PUZZLE_MAIN_CAST_LIMIT)
        .map(aggregatePersonDto)
    }
    return this.getMediaCast(kind, id)
  }

  private async getActorConnections(id: string): Promise<CatalogEntity[]> {
    const response = await this.tmdb.get<TmdbCombinedCredits>(`/person/${id}/combined_credits`)
    const unique = new Map<string, TmdbCombinedCredit>()
    for (const credit of response.cast ?? []) {
      if (credit.media_type !== 'movie' && credit.media_type !== 'tv') continue
      if (credit.media_type === 'tv' && credit.genre_ids?.includes(TALK_TV_GENRE_ID)) continue
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
    const candidates = [...selectedCredits.values()].sort(compareCreditsByPopularity)
    const verifiedCandidates = await Promise.all(candidates.map(async (credit) => {
      const cast = credit.media_type === 'tv'
        ? (await this.getTvAggregateCast(String(credit.id), false)).map(aggregatePersonDto)
        : await this.getMediaCast('movie', String(credit.id))
      return cast.some((person) => person.id === id) ? credit : null
    }))
    return verifiedCandidates.flatMap((credit) => credit ? [combinedCreditDto(credit)] : [])
  }

  async getTrendingMovies(): Promise<CatalogEntity[]> {
    const response = await this.tmdb.get<TmdbTrendingResponse>('/trending/movie/week')
    return response.results.map(movieDto)
  }

  private async getMediaCast(kind: 'movie' | 'tv', id: string): Promise<CatalogEntity[]> {
    if (kind === 'movie') {
      const response = await this.tmdb.get<TmdbCredits>(`/movie/${id}/credits`)
      return (response.cast ?? []).slice(0, MAX_ACTOR_CREDITS).map(personDto)
    }

    const cast = await this.getTvAggregateCast(id)
    return cast.map(aggregatePersonDto)
  }

  private async getTvAggregateCast(
    id: string,
    includeSeasonCredits = true,
  ): Promise<TmdbAggregateCastMember[]> {
    const tv = await this.tmdb.get<TmdbTv>(`/tv/${id}`)
    if (tv.genres?.some((genre) => genre.id === TALK_TV_GENRE_ID)) return []

    const seasonNumbers = includeSeasonCredits
      ? [...new Set((tv.seasons ?? [])
        .filter(({ episode_count }) => episode_count !== 0)
        .map(({ season_number }) => season_number))]
      : []
    const [seriesCredits, ...seasonCredits] = await Promise.all([
      this.tmdb.get<TmdbAggregateCredits>(`/tv/${id}/aggregate_credits`),
      ...seasonNumbers.map((season) =>
        this.tmdb.get<TmdbAggregateCredits>(`/tv/${id}/season/${season}/aggregate_credits`),
      ),
    ])
    const castById = new Map<number, TmdbAggregateCastMember>()
    const episodeCountsById = new Map<number, number>()
    for (const { cast } of seasonCredits) {
      for (const person of cast ?? []) {
        const episodeCount = person.total_episode_count
          ?? person.roles?.reduce((total, role) => total + (role.episode_count ?? 0), 0)
          ?? 0
        episodeCountsById.set(person.id, (episodeCountsById.get(person.id) ?? 0) + episodeCount)
      }
    }

    for (const person of [
      ...(seriesCredits.cast ?? []),
      ...seasonCredits.flatMap(({ cast }) => cast ?? []),
    ]) {
      const existing = castById.get(person.id)
      if (!existing) {
        castById.set(person.id, person)
        continue
      }

      const preferred = (person.popularity ?? 0) > (existing.popularity ?? 0) ? person : existing
      const orders = [existing.order, person.order].filter((order): order is number => order !== undefined)
      const roles = new Map<string, { character: string }>()
      for (const role of [...(existing.roles ?? []), ...(person.roles ?? [])]) {
        const character = role.character?.trim()
        if (character) roles.set(character, { character })
      }
      castById.set(person.id, {
        ...preferred,
        ...(orders.length > 0 ? { order: Math.min(...orders) } : {}),
        roles: [...roles.values()],
      })
    }
    return [...castById.values()]
      .map((person) => ({
        ...person,
        total_episode_count: episodeCountsById.get(person.id) ?? person.total_episode_count,
      }))
      .sort(compareAggregateCast)
  }
}
