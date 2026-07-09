import { createServer } from 'node:http'

import {
  createFeedbackPost,
  createInMemoryRateLimit,
  createPlaneIssueSink,
  createSlackWebhookNotifierFromEnv,
  feedbackMethodNotAllowed,
  planeConfigFromEnv,
  type FeedbackAuthAdapter,
  type FeedbackIssueSink,
  type FeedbackNotificationRule,
} from '../../server'

const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 8787)
const devToken = process.env.DEV_FEEDBACK_TOKEN

const env = {
  ...process.env,
  FEEDBACK_SLACK_WEBHOOK_URL: process.env.FEEDBACK_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL,
}

const auth: FeedbackAuthAdapter = async (request) => {
  if (!devToken) return null
  const expected = `Bearer ${devToken}`
  if (request.headers.get('authorization') !== expected) return null
  return { id: 'local-dev', email: 'local-dev@example.com' }
}

const planeConfig = planeConfigFromEnv(env)
const issueSink: FeedbackIssueSink = planeConfig
  ? createPlaneIssueSink(planeConfig)
  : async () => ({
      id: 'local-dev-ticket',
      url: 'https://prosjekt.example.com/workspace/projects/project/issues/local-dev-ticket',
      provider: 'Plane',
    })

const notifications = [
  createSlackWebhookNotifierFromEnv({
    env,
    name: 'slack-runtime-alert',
    types: ['bug', 'forbedring'],
    required: true,
  }),
].filter((rule): rule is FeedbackNotificationRule => rule !== null)

const postFeedback = createFeedbackPost({
  auth,
  rateLimit: createInMemoryRateLimit({ limit: 10, windowMs: 60_000 }),
  notifications,
  issueSink,
  appName: 'feedback-dev-server',
  includeUserAgent: true,
})

const server = createServer(async (nodeRequest, nodeResponse) => {
  const url = new URL(nodeRequest.url || '/', `http://${nodeRequest.headers.host || `${host}:${port}`}`)

  if (nodeRequest.method === 'GET' && url.pathname === '/') {
    nodeResponse.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    nodeResponse.end('POST /api/feedback with Authorization: Bearer <DEV_FEEDBACK_TOKEN>\n')
    return
  }

  const requestInit: RequestInit & { duplex?: 'half' } = {
    headers: nodeRequest.headers as HeadersInit,
  }
  if (nodeRequest.method) requestInit.method = nodeRequest.method
  if (nodeRequest.method !== 'GET' && nodeRequest.method !== 'HEAD') {
    requestInit.body = nodeRequest as unknown as BodyInit
    requestInit.duplex = 'half'
  }

  const webRequest = new Request(url, requestInit)

  const response =
    url.pathname === '/api/feedback' && nodeRequest.method === 'POST'
      ? await postFeedback(webRequest)
      : feedbackMethodNotAllowed()

  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  nodeResponse.end(await response.text())
})

server.listen(port, host, () => {
  const slackStatus = notifications.length > 0 ? 'configured' : 'missing'
  const authStatus = devToken ? 'configured' : 'missing'
  const planeStatus = planeConfig ? 'configured' : 'local fallback'
  console.log(`Feedback dev server listening on http://${host}:${port}`)
  console.log(`Auth token: ${authStatus}`)
  console.log(`Slack webhook: ${slackStatus}`)
  console.log(`Plane issue sink: ${planeStatus}`)
})
