import type { FeedbackType } from '../shared/feedback-types'

export type FeedbackUser = {
  id: string
  email?: string | null
  name?: string | null
}

export type FeedbackContext = {
  appName: string
  page?: string
  pageUrl?: string
  userAgent?: string
}

export type FeedbackIssue = {
  type: FeedbackType
  title: string
  descriptionText: string
  descriptionHtml: string
  reporter: FeedbackUser
  context: FeedbackContext
}

export type FeedbackAuthAdapter = (request: Request) => Promise<FeedbackUser | null>

export type FeedbackRateLimitResult = {
  ok: boolean
  retryAfterSec?: number
}

export type FeedbackRateLimitAdapter = (
  key: string,
  request: Request,
) => Promise<FeedbackRateLimitResult>

export type FeedbackIssueSink = (
  issue: FeedbackIssue,
  request: Request,
) => Promise<{ id?: string } | void>

export type FeedbackNotifier = (issue: FeedbackIssue, request: Request) => Promise<void>

export type FeedbackNotificationRule = {
  name: string
  notify: FeedbackNotifier
  types?: readonly FeedbackType[]
  required?: boolean
}

export class FeedbackSinkError extends Error {
  readonly status?: number
  readonly configError: boolean

  constructor(message: string, options: { status?: number; configError?: boolean } = {}) {
    super(message)
    this.name = 'FeedbackSinkError'
    if (options.status !== undefined) this.status = options.status
    this.configError = options.configError ?? false
  }
}
