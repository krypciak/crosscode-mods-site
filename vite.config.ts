import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

function htmlPartials(): Plugin {
    const partial = (name: string): string =>
        readFileSync(new URL(`./src/partials/${name}.html`, import.meta.url), 'utf8')
    return {
        name: 'shared-html-partials',
        transformIndexHtml(html) {
            return html //
                .replaceAll('<!--shared-header-->', partial('header'))
                .replaceAll('<!--shared-speculationrules-->', partial('speculation-rules'))
        },
    }
}

// multi-page app: one html entry per site page
// (dev serves any root .html automatically; this is needed for `vite build`)
export default defineConfig({
    plugins: [htmlPartials()],
    build: {
        rollupOptions: {
            input: {
                publish: fileURLToPath(new URL('./index.html', import.meta.url)),
                mods: fileURLToPath(new URL('./mods.html', import.meta.url)),
            },
        },
    },
})
