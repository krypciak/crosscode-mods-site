import config from '../../config.json'
if (!config.githubClientSecret) throw new Error('GITHUB_CLIENT_SECRET environment variable not set!')

export async function handleAccessToken(req: Request) {
    const originalBody = await req.text()
    const suffix = `client_secret=${encodeURIComponent(config.githubClientSecret)}`
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
