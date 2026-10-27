import { extractCCMod } from '../ccmoddb/zip'
import { runModCheck } from '../pages/check-mod/ccmod-check'

/* TODO: check if has github token */
export async function handleModPublishRequest(req: Request) {
    try {
        const body = await req.json()

        const token: string = body.token
        if (!token) throw new Error('missing "token" query parameter')

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

/* TODO: check if submitted is a newer version */
async function checkCCMod(modUrl: string, branch: string): Promise<boolean> {
    const resp = await fetch(modUrl)
    const modArchive = await resp.bytes()

    const isCCMod = modUrl.endsWith('.ccmod')
    const result = extractCCMod(modArchive, isCCMod)

    const stats = await runModCheck(undefined, result.text, branch, false, true)
    const success = stats?.failCount == 0

    return success
}
