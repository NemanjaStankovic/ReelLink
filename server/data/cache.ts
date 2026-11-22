interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>()

  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey) this.entries.delete(oldestKey)
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }
}
