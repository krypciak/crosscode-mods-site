import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { readFile } from 'fs/promises'

async function htmlPartials(): Promise<Plugin> {
    function read(name: string): Promise<string> {
        return readFile(new URL(`./src/partials/${name}.html`, import.meta.url), 'utf8')
    }
    const header = await read('header')
    const speculationRules = await read('speculation-rules')

    return {
        name: 'shared-html-partials',
        transformIndexHtml(html) {
            return html
                .replaceAll('<!--shared-header-->', header)
                .replaceAll('<!--shared-speculationrules-->', speculationRules)
        },
    }
}

// multi-page app: one html entry per site page
// (dev serves any root .html automatically; this is needed for `vite build`)
export default defineConfig({
    plugins: [await htmlPartials()],
    build: {
        rollupOptions: {
            input: {
                mods: fileURLToPath(new URL('./index.html', import.meta.url)),
                'publish-mod': fileURLToPath(new URL('./publish-mod.html', import.meta.url)),
            },
        },
    },
})
