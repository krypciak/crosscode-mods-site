import { getErrorMessage } from '../error-msg'
import { modPublishRequests } from './mod-publish-requests'

export async function handleGetModPublishRequests(_req: Request) {
    try {
        return Response.json(modPublishRequests)
    } catch (e) {
        const message = getErrorMessage(e)
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}
