export class KeyValueHttpCache<K extends string = string> {
    constructor(private cacheKey: string) {}

    async set(key: K, value: string) {
        const cache = await caches.open(this.cacheKey)
        const response = new Response(new Blob([value]), {
            headers: { 'Content-Type': 'text/plain' },
        })
        await cache.put(key, response)
    }

    async get(key: K): Promise<string | undefined> {
        const cache = await caches.open(this.cacheKey)
        const response = await cache.match(key)
        return response ? response.text() : undefined
    }
}
