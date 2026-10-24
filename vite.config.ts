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
    root: './src/pages',
    publicDir: '../../public',
    build: {
        outDir: '../../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                mods: fileURLToPath(new URL('./src/pages/index.html', import.meta.url)),
                'publish-mod': fileURLToPath(new URL('./src/pages/publish-mod.html', import.meta.url)),
                'check-mod': fileURLToPath(new URL('./src/pages/check-mod.html', import.meta.url)),
            },
        },
    },
})
