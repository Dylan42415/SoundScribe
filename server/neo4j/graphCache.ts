/**
 * In-memory LRU cache for graph query results.
 * Prevents redundant Neo4j round-trips for identical queries.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlSeconds: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (LRU: most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(predicate: (key: string) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Shared cache instance: max 100 entries, 5-minute TTL
export const graphQueryCache = new LRUCache<any[]>(100, 300);

// Generate a stable cache key from query + params
export function cacheKey(query: string, params: Record<string, any>): string {
  const paramsStr = JSON.stringify(params, Object.keys(params).sort());
  return `${query.replace(/\s+/g, " ").trim()}|${paramsStr}`;
}

// Invalidate all cached results for a specific recording
export function invalidateRecordingCache(recordingId: number): void {
  graphQueryCache.invalidate((key) => key.includes(`"recordingId":${recordingId}`));
}
