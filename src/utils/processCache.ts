export class ProcessPathCache {
  private cache: Map<number, { path: string; timestamp: number }> = new Map()
  private maxSize: number
  private ttl: number

  constructor(maxSize = 1000, ttl = 10 * 60 * 1000) {
    this.maxSize = maxSize
    this.ttl = ttl
  }

  get(pid: number): string | undefined {
    const entry = this.cache.get(pid)
    if (!entry) {
      console.log('No entry found for pid:', pid)
      return undefined
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(pid)
      console.log('Entry expired for pid:', pid)
      return undefined
    }

    // LRU: Refresh key position
    this.cache.delete(pid)
    this.cache.set(pid, entry)
    return entry.path
  }

  set(pid: number, path: string): void {
    console.log('Setting path for pid:', pid, 'path:', path)
    if (this.cache.has(pid)) {
      this.cache.delete(pid)
    } else if (this.cache.size >= this.maxSize) {
      // LRU: Remove first item (oldest accessed)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }

    this.cache.set(pid, { path, timestamp: Date.now() })
  }
}

export const pathCache = new ProcessPathCache()
