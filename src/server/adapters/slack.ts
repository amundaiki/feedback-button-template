import type { FeedbackType } from '../../shared/feedback-types'
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
      type: 'image'
      image_url: string
      alt_text: string
      title?: { type: 'plain_text'; text: string; emoji?: boolean }
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

function slackTitle(issue: FeedbackIssue): string {
  return issue.type === 'bug' ? '⚠️ BUG' : 'FORBEDRING'
}

export type SlackWebhookNotifierFromEnvOptions = Omit<SlackWebhookNotifierOptions, 'webhookUrl'> & {
  env?: Env
  envKey?: string
}

function slackText(issue: FeedbackIssue): string {
  const lines = [
    `${slackTitle(issue)} i ${issue.context.appName}`,
    `Hva de skrev: ${issue.title}`,
    issue.descriptionText,
    issue.ticket?.url ? `Ticket: ${issue.ticket.url}` : null,
    issue.context.pageUrl ? `Lenke: ${issue.context.pageUrl}` : null,
    issue.context.imageUrl ? `Bilde: ${issue.context.imageUrl}` : null,
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
        text: truncate(slackTitle(issue), 150),
        emoji: false,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Hva de skrev*\n*${escapeSlackMrkdwn(issue.title)}*\n${escapeSlackMrkdwn(
          truncate(issue.descriptionText, 700),
        )}`,
      },
    },
  ]

  const context = [
    `App: ${issue.context.appName}`,
    issue.ticket?.provider ? `Ticket: ${issue.ticket.provider}` : null,
    issue.context.page ? `Lenke: ${issue.context.page}` : null,
    issue.context.imageUrl ? 'Bilde: vedlagt' : null,
    issue.reporter.email ? `Rapportert av: ${issue.reporter.email}` : null,
  ]
    .filter((line): line is string => line !== null)
    .map((line) => ({ type: 'mrkdwn' as const, text: escapeSlackMrkdwn(line) }))

  if (context.length > 0) {
    blocks.push({ type: 'context', elements: context })
  }

  if (issue.context.imageUrl) {
    blocks.push({
      type: 'image',
      image_url: issue.context.imageUrl,
      alt_text: 'Vedlagt bilde fra tilbakemelding',
      title: { type: 'plain_text', text: 'Vedlagt bilde', emoji: false },
    })
  }

  const actionElements: Array<{
    type: 'button'
    text: { type: 'plain_text'; text: string; emoji?: boolean }
    url: string
  }> = []

  if (issue.ticket?.url) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Åpne ticket', emoji: false },
      url: issue.ticket.url,
    })
  }

  if (issue.context.pageUrl) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Åpne side', emoji: false },
      url: issue.context.pageUrl,
    })
  }

  if (issue.context.imageUrl) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Åpne bilde', emoji: false },
      url: issue.context.imageUrl,
    })
  }

  if (actionElements.length > 0) {
    blocks.push({
      type: 'actions',
      elements: actionElements,
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
