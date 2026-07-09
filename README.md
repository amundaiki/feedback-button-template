# Feedback Button Template

Unstyled, reusable feedback button for authenticated admin/customer surfaces.

Projects own the styling, authentication, notifications, and issue-tracker wiring.

## What You Get

- React client components: `FeedbackButton` and `FeedbackDialog`
- Web-standard API route factory that works in Next App Router
- Required server-side auth adapter
- Required rate-limit adapter
- Plane issue sink adapter
- Optional type-based Slack and email notifications after issue creation, so alerts can include ticket links
- Minimal optional CSS hooks, no design-system dependency
- Tests for auth, validation, rate limit, escaping, and provider failures

## Quick Install By Copy

Copy `src/client`, `src/server`, and `src/shared` into your app, then mount:

```tsx
import { FeedbackButton } from '@/components/feedback'

export function AdminHeader() {
  return <FeedbackButton />
}
```

Create a route:

```ts
import {
  createFeedbackPost,
  createInMemoryRateLimit,
  createPlaneIssueSink,
  createSlackWebhookNotifierFromEnv,
  feedbackMethodNotAllowed,
  planeConfigFromEnv,
} from '@/server/feedback'

const auth = async () => {
  // Replace with your app's real session/auth check.
  // Return null when not authenticated. Missing auth must fail closed.
  return null
}

const slackBugAlert = createSlackWebhookNotifierFromEnv({
  name: 'slack-bug-alert',
  types: ['bug'],
})

export const POST = createFeedbackPost({
  auth,
  rateLimit: createInMemoryRateLimit({ limit: 5, windowMs: 60_000 }),
  notifications: slackBugAlert ? [slackBugAlert] : [],
  issueSink: createPlaneIssueSink(planeConfigFromEnv()),
  appName: 'my-admin',
})

export const GET = feedbackMethodNotAllowed
```

The example above intentionally denies all users until you connect real auth.

## Notifications

Notifications are explicit server-side adapters. They run after the issue sink and can be routed by feedback type. If the issue sink returns a `url`, Slack includes a ticket button in the alert.

```ts
import { createEmailNotifier, createSlackWebhookNotifierFromEnv } from '@/server/feedback'

const notifications = [
  createSlackWebhookNotifierFromEnv({
    name: 'slack-bug-alert',
    types: ['bug'],
  }),
  createEmailNotifier({
    name: 'email-bug-alert',
    types: ['bug'],
    to: ['ops@example.com'],
    sendEmail: async (message) => {
      // Use your existing Resend, Postmark, Sendgrid, SMTP, or Payload email adapter here.
      await sendProjectEmail(message)
    },
  }),
].filter(Boolean)
```

By default, notification failures are logged and the issue remains created. Set `required: true` on a notification rule if the API response should fail when that notification fails after issue creation.

Slack notifications are sent from the runtime server. Locally that means your dev server. In production that means your deployed server, for example Railway. Do not send feedback notifications from GitHub Actions.

## Local Runtime Test

Run the included local server with server-only environment variables:

```bash
DEV_FEEDBACK_TOKEN="replace-with-random-local-token" \
FEEDBACK_SLACK_WEBHOOK_URL="<server-only-slack-webhook-url>" \
npm run dev:server
```

Then submit a test feedback request:

```bash
curl -i http://127.0.0.1:8787/api/feedback \
  -H "Authorization: Bearer replace-with-random-local-token" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "bug",
    "title": "Test fra lokal dev-server",
    "description": "Dette er en runtime-test av Slack-varsel.",
    "page": "/admin/test"
  }'
```

The dev server binds to `127.0.0.1` by default and refuses feedback unless `DEV_FEEDBACK_TOKEN` matches the bearer token.

## Railway Production

On Railway, set `FEEDBACK_SLACK_WEBHOOK_URL` as a service variable. Do not prefix it with `NEXT_PUBLIC_`.

When the app is deployed, the feedback API route creates the ticket first and then sends Slack from the Railway runtime with the ticket link. If your project uses Plane/GitHub/Linear tickets, configure that issue sink in the same server route.

## Styling

The components are intentionally almost unstyled. They expose `data-feedback-*` attributes and className props so each project can own the look.

Optional starter CSS lives in `src/client/feedback-minimal.css`. Import it only if you want a basic usable layout:

```tsx
import '@/components/feedback/feedback-minimal.css'
```

## Security Contract

This is for customer, demo, report, and admin surfaces. Treat it as private by default.

- Server route requires auth.
- Missing auth must return `401`.
- Missing Plane config returns `503`, not a public fallback.
- Rate limit is required.
- Slack webhook URLs and email provider secrets stay server-only.
- Notification errors are logged without request bodies, webhook URLs, provider tokens, or raw provider responses.
- User input is length-limited and escaped before issue HTML is created.
- Provider errors are logged without request bodies, tokens, or raw provider responses.
- Responses carry `X-Robots-Tag: noindex, nofollow`.

The included in-memory rate limiter is fine for local development and small single-instance deployments. For multi-instance production, replace it with Redis, Upstash, database-backed, or platform rate limiting.

## Make It A GitHub Template

1. Push this folder to a private GitHub repository.
2. In GitHub: Settings -> General -> Template repository.
3. Keep the repository private unless you have reviewed all docs and examples for internal names.

## Verification

```bash
npm install
npm run verify
```
