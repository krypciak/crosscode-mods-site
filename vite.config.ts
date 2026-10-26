import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
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

function ultimateCrosscodeTypedefsZip(): Plugin {
    return {
        name: 'ultimate-crosscode-typedefs-proxy',
        configureServer(server) {
            let cache: Uint8Array | undefined

            server.middlewares.use(async (req, res, next) => {
                if (req.url !== '/ultimate-crosscode-typedefs.zip') return next()

                if (!cache) {
                    const upstream = await fetch(
                        'https://codeload.github.com/krypciak/ultimate-crosscode-typedefs/legacy.zip/refs/heads/master'
                    )
                    if (!upstream.ok) {
                        res.statusCode = upstream.status
                        return res.end(`Upstream error: ${upstream.status}`)
                    }
                    cache = await upstream.bytes()
                }

                res.setHeader('Content-Type', 'application/zip')
                res.setHeader('Cache-Control', 'public, max-age=432000') // 5d for browser
                res.removeHeader('Server')
                res.end(cache)
            })
        },
    }
}

// multi-page app: one html entry per site page
// (dev serves any root .html automatically; this is needed for `vite build`)
export default defineConfig({
    plugins: [await htmlPartials(), ultimateCrosscodeTypedefsZip()],
    root: './src/pages',
    publicDir: '../../public',
    build: {
        minify: false,
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
