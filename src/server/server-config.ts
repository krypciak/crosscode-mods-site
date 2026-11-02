import { readFile } from 'fs/promises'

export const serverConfig: typeof import('../../config.json') = JSON.parse(
    await readFile(new URL('../../config.json', import.meta.url).pathname, 'utf8')
)
