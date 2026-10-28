export interface KeyValueStore<K, V> {
    set(key: K, value: V): void | Promise<void>
    get(key: K): V | undefined | Promise<V | undefined>
    clear(): void | Promise<void>
    delete(key: K): void
}

export class KeyValueStoreHttpCache<K extends string, V> implements KeyValueStore<K, V> {
    constructor(private cacheKey: string) {}

    async set(key: K, value: V) {
        const cache = await caches.open(this.cacheKey)
        const response = new Response(new Blob([JSON.stringify(value)]), {
            headers: { 'Content-Type': 'text/plain' },
        })
        await cache.put(key, response)
    }

    async get(key: K): Promise<V | undefined> {
        const cache = await caches.open(this.cacheKey)
        const response = await cache.match(key)
        return response ? response.json() : undefined
    }

    async delete(key: K): Promise<void> {
        const cache = await caches.open(this.cacheKey)
        await cache.delete(key)
    }

    async clear(): Promise<void> {
        await caches.delete(this.cacheKey)
    }
}

export class KeyValueStoreInMemory<K, V> implements KeyValueStore<K, V> {
    private cache = new Map<K, { storedAt: number; value: V }>()

    constructor(private ttlMs: number) {}

    set(key: K, value: V) {
        this.cache.set(key, { storedAt: performance.now(), value })
    }

    get(key: K): V | undefined {
        const entry = this.cache.get(key)
        if (!entry) return undefined

        if (performance.now() - entry.storedAt >= this.ttlMs) {
            this.cache.delete(key)
            return undefined
        }

        return entry.value
    }

    delete(key: K): void {
        this.cache.delete(key)
    }

    clear(): void {
        this.cache.clear()
    }
}

export class KeyValueStoreLocalStorage<K extends string, V> implements KeyValueStore<K, V> {
    private keys = new Set<K>()

    constructor(private ttlMs: number) {}

    set(key: K, value: V) {
        localStorage.setItem(key, JSON.stringify({ storedAt: performance.now(), value: JSON.stringify(value) }))
        this.keys.add(key)
    }

    get(key: K): V | undefined {
        const str = localStorage.getItem(key)
        if (!str) return undefined
        const json = JSON.parse(str)

        if (performance.now() - json.storedAt >= this.ttlMs) {
            localStorage.removeItem(key)
            return undefined
        }
        this.keys.add(key)

        return JSON.parse(json.value)
    }

    clear(): void | Promise<void> {
        for (const key of this.keys) this.delete(key)
        this.keys.clear()
    }

    delete(key: K) {
        localStorage.removeItem(key)
    }
}
