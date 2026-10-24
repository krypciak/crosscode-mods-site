const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
if (!githubClientSecret) throw new Error('GITHUB_CLIENT_SECRET environment variable not set!')

Bun.serve({
    port: 4895,
    hostname: '127.0.0.1',
    async fetch(req) {
        const pathname = new URL(req.url).pathname
        if (req.method == 'POST' && pathname == '/access_token') return handleAccessToken(req)
        if (req.method == 'GET' && pathname == '/gh') return handleGithubDownload(req)
        if (req.method == 'POST' && pathname == '/mod-publish-request') return handleModPublishRequest(req)

        return new Response('Not Found', { status: 404 })
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
        // no caching for now
        headers.set('Cache-Control', 'no-store')
        headers.set('X-Github-Status', String(upstream.status))

        return new Response(upstream.body, { status: upstream.status, headers })
    } catch (e) {
        const message = (e as Error).message
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

// required request parameters:
// github access token
// mod url
// branch
// source
async function handleModPublishRequest(req: Request) {
    return new Response()
}
