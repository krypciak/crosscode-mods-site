import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { readFile } from 'fs/promises'

async function htmlPartials(): Promise<Plugin> {
    function read(name: string): Promise<string> {
        return readFile(new URL(`./src/partials/${name}.html`, import.meta.url), 'utf8')
    }
    const header = await read('header')
    const speculationRules = await read('speculation-rules')
    const dbSelect = await read('db-select')

    return {
        name: 'shared-html-partials',
        transformIndexHtml(html) {
            return html
                .replaceAll('<!--shared-header-->', header)
                .replaceAll('<!--shared-speculationrules-->', speculationRules)
                .replaceAll('<!--shared-db-select-->', dbSelect)
        },
    }
}

function rootRedirect(): Plugin {
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url ?? '/'
        const queryIndex = url.indexOf('?')
        const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex)

        if (pathname === '/' || pathname === '/index.html') {
            const query = queryIndex === -1 ? '' : url.slice(queryIndex)
            res.statusCode = 302 // temporary so the browser doesn't cache it during dev
            res.setHeader('Location', '/mods' + query)
            res.end()
            return
        }

        next()
    }

    return {
        name: 'root-redirect',
        configureServer(server) {
            server.middlewares.use(middleware)
        },
        configurePreviewServer(server) {
            server.middlewares.use(middleware)
        },
    }
}

// multi-page app: one html entry per site page
// (dev serves any root .html automatically; this is needed for `vite build`)
export default defineConfig({
    appType: 'mpa',
    plugins: [await htmlPartials(), rootRedirect()],
    root: './src/pages',
    publicDir: '../../public',
    build: {
        minify: false,
        outDir: '../../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                mods: fileURLToPath(new URL('./src/pages/mods.html', import.meta.url)),
                'publish-mod': fileURLToPath(new URL('./src/pages/publish-mod.html', import.meta.url)),
                'check-mod': fileURLToPath(new URL('./src/pages/check-mod.html', import.meta.url)),
                'format-code': fileURLToPath(new URL('./src/pages/format-code.html', import.meta.url)),
            },
        },
    },
    server: {
        proxy: {
            '/ultimate-crosscode-typedefs.zip': {
                target: 'https://codeload.github.com/krypciak/ultimate-crosscode-typedefs/legacy.zip/refs/heads/master',
                changeOrigin: true,
                rewrite: () => '',
            },
        },
    },
})
