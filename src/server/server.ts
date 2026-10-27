import { handleAccessToken } from './handle-access-token'
import { handleGithubDownload } from './handle-github-download'
import { handleModPublishRequest } from './handle-mod-publish-request'

Bun.serve({
    port: 4895,
    hostname: '127.0.0.1',
    routes: {
        '/access_token': { POST: handleAccessToken },
        '/gh': { GET: handleGithubDownload },
        '/mod-publish-request': { POST: handleModPublishRequest },
    },
})
