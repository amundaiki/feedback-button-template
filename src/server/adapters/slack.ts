import { FEEDBACK_TYPE_LABELS, type FeedbackType } from '../../shared/feedback-types'
import type { FeedbackIssue, FeedbackNotificationRule } from '../types'
import { FeedbackSinkError } from '../types'

type Env = Record<string, string | undefined>

type SlackBlock =
  | {
      type: 'header'
      text: { type: 'plain_text'; text: string; emoji?: boolean }
    }
  | {
      type: 'section'
      text: { type: 'mrkdwn'; text: string }
    }
  | {
      type: 'context'
      elements: Array<{ type: 'mrkdwn'; text: string }>
    }
  | {
      type: 'actions'
      elements: Array<{
        type: 'button'
        text: { type: 'plain_text'; text: string; emoji?: boolean }
        url: string
      }>
    }

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

function escapeSlackMrkdwn(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function slackBlocks(issue: FeedbackIssue): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: truncate(`Ny ${FEEDBACK_TYPE_LABELS[issue.type].toLowerCase()}`, 150),
        emoji: false,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${escapeSlackMrkdwn(issue.title)}*\n${escapeSlackMrkdwn(
          truncate(issue.descriptionText, 700),
        )}`,
      },
    },
  ]

  const context = [
    `App: ${issue.context.appName}`,
    issue.context.page ? `Side: ${issue.context.page}` : null,
    issue.reporter.email ? `Rapportert av: ${issue.reporter.email}` : null,
  ]
    .filter((line): line is string => line !== null)
    .map((line) => ({ type: 'mrkdwn' as const, text: escapeSlackMrkdwn(line) }))

  if (context.length > 0) {
    blocks.push({ type: 'context', elements: context })
  }

  if (issue.context.pageUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Åpne side', emoji: false },
          url: issue.context.pageUrl,
        },
      ],
    })
  }

  return blocks
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
        body: JSON.stringify({ text: slackText(issue), blocks: slackBlocks(issue) }),
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
