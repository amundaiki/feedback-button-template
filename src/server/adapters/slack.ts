import { FEEDBACK_TYPE_LABELS, type FeedbackType } from '../../shared/feedback-types'
import type { FeedbackIssue, FeedbackNotificationRule } from '../types'
import { FeedbackSinkError } from '../types'

type Env = Record<string, string | undefined>

export type SlackWebhookNotifierOptions = {
  webhookUrl: string
  name?: string
  types?: readonly FeedbackType[]
  required?: boolean
}

export type SlackWebhookNotifierFromEnvOptions = Omit<SlackWebhookNotifierOptions, 'webhookUrl'> & {
  env?: Env
  envKey?: string
}

function slackText(issue: FeedbackIssue): string {
  const lines = [
    `Ny ${FEEDBACK_TYPE_LABELS[issue.type].toLowerCase()} i ${issue.context.appName}: ${issue.title}`,
    issue.context.pageUrl ? `Side: ${issue.context.pageUrl}` : null,
    issue.reporter.email ? `Rapportert av: ${issue.reporter.email}` : null,
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
}

export function createSlackWebhookNotifier({
  webhookUrl,
  name = 'slack',
  types,
  required = false,
}: SlackWebhookNotifierOptions): FeedbackNotificationRule {
  const rule: FeedbackNotificationRule = {
    name,
    required,
    notify: async (issue) => {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slackText(issue) }),
      })

      if (!response.ok) {
        throw new FeedbackSinkError(`Slack webhook failed with ${response.status}`, {
          status: response.status,
        })
      }
    },
  }
  if (types !== undefined) rule.types = types
  return rule
}

export function createSlackWebhookNotifierFromEnv({
  env = process.env,
  envKey = 'FEEDBACK_SLACK_WEBHOOK_URL',
  ...options
}: SlackWebhookNotifierFromEnvOptions = {}): FeedbackNotificationRule | null {
  const webhookUrl = env[envKey]
  if (!webhookUrl) return null
  return createSlackWebhookNotifier({ webhookUrl, ...options })
}
