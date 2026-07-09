# Feedback Button Template

Unstyled, reusable feedback button for authenticated admin/customer surfaces.

Projects own the styling, authentication, notifications, and issue-tracker wiring.

## What You Get

- React client components: `FeedbackButton` and `FeedbackDialog`
- Web-standard API route factory that works in Next App Router
- Required server-side auth adapter
- Required rate-limit adapter
- Plane issue sink adapter
- Optional type-based Slack and email notifications before issue creation
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

Notifications are explicit server-side adapters. They run before the issue sink and can be routed by feedback type.

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

By default, notification failures are logged and the issue is still created. Set `required: true` on a notification rule if that notification must succeed before an issue is created.

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

## Repository Slack Notifications

This template includes a GitHub Actions workflow that can notify Slack when issues or pull requests are opened or reopened.

Add a repository secret named `SLACK_WEBHOOK_URL` with your Slack incoming webhook URL. The workflow skips notification when the secret is missing, and the URL is never committed or printed.

## Verification

```bash
npm install
npm run verify
```
