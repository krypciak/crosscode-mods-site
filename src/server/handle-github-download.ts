import { getErrorMessage } from '../error-msg'

// accepted: https://github.com/{owner}/{repo}/archive/... and https://github.com/{owner}/{repo}/releases/download/...
// examples:
//  https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v2.26.1/v2.14.4.zip
//  https://github.com/krypciak/cc-fancy-crash/releases/download/v1.1.0/cc-fancy-crash-1.1.0.ccmod

//  https://github.com/CCDirectLink/Blades/archive/1.6.0.zip
const allowedDownloadPattern = /^\/[^/]+\/[^/]+\/(archive\/|releases\/download\/)/

export function checkModArchiveUrl(url: string) {
    let target: URL
    try {
        target = new URL(url)
    } catch {
        throw new Error('invalid url')
    }

    if (target.protocol != 'https:' || target.hostname != 'github.com')
        throw new Error('only https://github.com urls are allowed')
    if (!allowedDownloadPattern.test(target.pathname))
        throw new Error('only github archive or releases/download urls are allowed')

    return target
}

export async function handleGithubDownload(req: Request) {
    try {
        const urlParam = new URL(req.url).searchParams.get('url')
        if (!urlParam) throw new Error('missing "url" query parameter')

        const target = checkModArchiveUrl(urlParam)
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
        const message = getErrorMessage(e)
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}
