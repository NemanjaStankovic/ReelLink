import { TtlCache } from './cache.js'

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

export class TmdbClient {
  private readonly cache = new TtlCache(60 * 60 * 1000)
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private activeRequests = 0
  private readonly requestQueue: Array<() => void> = []

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const apiKey = process.env.TMDB_API_KEY
    if (!apiKey) throw new TmdbError('TMDB API key is not configured.', 503)

    const url = new URL(`https://api.themoviedb.org/3${path}`)
    url.searchParams.set('api_key', apiKey)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const cacheParams = new URLSearchParams(url.searchParams)
    cacheParams.delete('api_key')
    const cacheKey = `${url.pathname}?${cacheParams.toString()}`
    const cached = this.cache.get<T>(cacheKey)
    if (cached !== undefined) return cached

    const existing = this.inFlight.get(cacheKey)
    if (existing) return existing as Promise<T>

    const request = this.request<T>(url, cacheKey)
    this.inFlight.set(cacheKey, request)
    try {
      return await request
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  private async request<T>(url: URL, cacheKey: string): Promise<T> {
    const release = await this.acquireRequestSlot()
    try {
      let response: Response
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new TmdbError('TMDB request timed out.', 504)
        }
        throw new TmdbError('Could not reach TMDB.', 502)
      }

      if (response.status === 429) {
        const retryHeader = response.headers.get('retry-after')
        const retryAfter = retryHeader
          ? Math.max(0, Number.isFinite(Number(retryHeader))
            ? Number(retryHeader)
            : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000))
          : undefined
        throw new TmdbError(
          'TMDB is temporarily rate-limiting requests.',
          429,
          retryAfter !== undefined && Number.isFinite(retryAfter) ? retryAfter : undefined,
        )
      }
      if (!response.ok) {
        throw new TmdbError(
          response.status === 404 ? 'TMDB could not find that item.' : 'TMDB request failed.',
          response.status === 404 ? 404 : 502,
        )
      }

      const data = await response.json() as T
      this.cache.set(cacheKey, data)
      return data
    } finally {
      release()
    }
  }

  private async acquireRequestSlot(): Promise<() => void> {
    if (this.activeRequests >= 3) {
      await new Promise<void>((resolve) => this.requestQueue.push(resolve))
      return this.releaseRequestSlot()
    }
    this.activeRequests++
    return this.releaseRequestSlot()
  }

  private releaseRequestSlot(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.requestQueue.shift()
      if (next) next()
      else this.activeRequests--
    }
  }
}
