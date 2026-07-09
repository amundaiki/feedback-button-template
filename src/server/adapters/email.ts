import { FEEDBACK_TYPE_LABELS, type FeedbackType } from '../../shared/feedback-types'
import type { FeedbackIssue, FeedbackNotificationRule } from '../types'

export type FeedbackEmailMessage = {
  to: readonly string[]
  from?: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

export type EmailNotifierOptions = {
  to: string | readonly string[]
  from?: string
  name?: string
  types?: readonly FeedbackType[]
  required?: boolean
  subjectPrefix?: string
  sendEmail: (message: FeedbackEmailMessage) => Promise<void>
}

function toRecipients(value: string | readonly string[]): readonly string[] {
  if (typeof value === 'string') return [value]
  return value
}

function emailText(issue: FeedbackIssue): string {
  return [
    `Type: ${FEEDBACK_TYPE_LABELS[issue.type]}`,
    `App: ${issue.context.appName}`,
    `Tittel: ${issue.title}`,
    issue.context.pageUrl ? `Side: ${issue.context.pageUrl}` : null,
    issue.reporter.email ? `Rapportert av: ${issue.reporter.email}` : null,
    '',
    issue.descriptionText,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function createEmailNotifier({
  to,
  from,
  name = 'email',
  types,
  required = false,
  subjectPrefix = '[Feedback]',
  sendEmail,
}: EmailNotifierOptions): FeedbackNotificationRule {
  const rule: FeedbackNotificationRule = {
    name,
    required,
    notify: async (issue) => {
      const message: FeedbackEmailMessage = {
        to: toRecipients(to),
        subject: `${subjectPrefix} ${FEEDBACK_TYPE_LABELS[issue.type]}: ${issue.title}`,
        text: emailText(issue),
        html: issue.descriptionHtml,
      }
      if (from !== undefined) message.from = from
      if (issue.reporter.email) message.replyTo = issue.reporter.email

      await sendEmail(message)
    },
  }
  if (types !== undefined) rule.types = types
  return rule
}
