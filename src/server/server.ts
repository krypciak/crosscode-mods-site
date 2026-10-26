import { extractCCMod } from '../ccmoddb/zip'
import { runModCheck } from '../pages/check-mod/ccmod-check'

const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
if (!githubClientSecret) throw new Error('GITHUB_CLIENT_SECRET environment variable not set!')

Bun.serve({
    port: 4895,
    hostname: '127.0.0.1',
    routes: {
        '/access_token': { POST: handleAccessToken },
        '/gh': { GET: handleGithubDownload },
        '/mod-publish-request': { POST: handleModPublishRequest },
    },
})

async function handleAccessToken(req: Request) {
    const originalBody = await req.text()
    const suffix = `client_secret=${encodeURIComponent(githubClientSecret!)}`
    const newBody = originalBody ? `${originalBody}&${suffix}` : suffix

    const upstream = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': req.headers.get('content-type') ?? 'application/x-www-form-urlencoded',
            'Content-Length': String(Buffer.byteLength(newBody)),
        },
        body: newBody,
    })

    return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    })
}

// accepted: https://github.com/{owner}/{repo}/archive/... and https://github.com/{owner}/{repo}/releases/download/...
// examples:
//  https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v2.26.1/v2.14.4.zip
//  https://github.com/krypciak/cc-fancy-crash/releases/download/v1.1.0/cc-fancy-crash-1.1.0.ccmod
//  https://github.com/CCDirectLink/Blades/archive/1.6.0.zip
const allowedDownloadPattern = /^\/[^/]+\/[^/]+\/(archive\/|releases\/download\/)/

/* TODO: check if has github token */
async function handleGithubDownload(req: Request) {
    try {
        const urlParam = new URL(req.url).searchParams.get('url')
        if (!urlParam) throw new Error('missing "url" query parameter')

        let target: URL
        try {
            target = new URL(urlParam)
        } catch {
            throw new Error('invalid url')
        }

        if (target.protocol != 'https:' || target.hostname != 'github.com')
            throw new Error('only https://github.com urls are allowed')
        if (!allowedDownloadPattern.test(target.pathname))
            throw new Error('only github archive or releases/download urls are allowed')

        const upstream = await fetch(target, { redirect: 'follow' })

        const headers = new Headers()
        headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/octet-stream')
        if (upstream.headers.get('Content-Disposition'))
            headers.set('Content-Disposition', upstream.headers.get('Content-Disposition')!)
        /* TODO: set to no cache!! */
        // headers.set('Cache-Control', 'no-store')
        headers.set('Cache-Control', 'max-age=604800')
        headers.set('X-Github-Status', String(upstream.status))

        return new Response(upstream.body, { status: upstream.status, headers })
    } catch (e) {
        const message = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

async function handleModPublishRequest(req: Request) {
    try {
        const body = await req.json()

        const tokenParam: string = body.token
        if (!tokenParam) throw new Error('missing "token" query parameter')

        const modUrl: string = body.url
        if (!modUrl) throw new Error('missing "url" query parameter')

        const branch: string = body.branch
        if (!branch) throw new Error('missing "branch" query parameter')

        const source: string = body.source
        if (source === undefined) throw new Error('missing "source" query parameter')

        if (!(await checkCCMod(modUrl, branch))) throw new Error('ccmod.json check failed')

        return new Response('success', { status: 200 })
    } catch (e) {
        const message = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

async function checkCCMod(modUrl: string, branch: string): Promise<boolean> {
    const resp = await fetch(modUrl)
    const modArchive = await resp.bytes()

    const isCCMod = modUrl.endsWith('.ccmod')
    const result = extractCCMod(modArchive, isCCMod)

    const stats = await runModCheck(undefined, result.text, branch, false, true)
    const success = stats?.failCount == 0

    return success
}
