import {
  createFeedbackPost,
  createInMemoryRateLimit,
  createSlackWebhookNotifierFromEnv,
  createPlaneIssueSink,
  feedbackMethodNotAllowed,
  planeConfigFromEnv,
  type FeedbackAuthAdapter,
  type FeedbackNotificationRule,
} from '../../server'

export const runtime = 'nodejs'

const auth: FeedbackAuthAdapter = async () => {
  // Replace with your real server-side session check.
  // Return null when not authenticated. Do not ship this deny-all example unchanged.
  return null
}

const notifications = [
  createSlackWebhookNotifierFromEnv({
    name: 'slack-bug-alert',
    types: ['bug'],
  }),
].filter((rule): rule is FeedbackNotificationRule => rule !== null)

export const POST = createFeedbackPost({
  auth,
  rateLimit: createInMemoryRateLimit({ limit: 5, windowMs: 60_000 }),
  notifications,
  issueSink: createPlaneIssueSink(planeConfigFromEnv()),
  appName: 'my-admin',
})

export const GET = feedbackMethodNotAllowed
