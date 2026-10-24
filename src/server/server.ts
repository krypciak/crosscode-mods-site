const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
if (!githubClientSecret) throw new Error('GITHUB_CLIENT_SECRET environment variable not set!')

Bun.serve({
    port: 4895,
    hostname: '127.0.0.1',
    async fetch(req) {
        const pathname = new URL(req.url).pathname
        if (req.method == 'POST' && pathname == '/access_token') return handleAccessToken(req)
        if (req.method == 'GET' && pathname == '/gh') return handleGithubDownload(req)
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

async function handleGithubDownload(req: Request) {
    return new Response()
}
