import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPES,
  type FeedbackSubmitPayload,
  type FeedbackType,
} from '../shared/feedback-types'
import type {
  FeedbackAuthAdapter,
  FeedbackContext,
  FeedbackIssue,
  FeedbackIssueSink,
  FeedbackNotificationRule,
  FeedbackRateLimitAdapter,
  FeedbackUser,
} from './types'
import { FeedbackSinkError } from './types'

export type FeedbackRouteOptions = {
  auth: FeedbackAuthAdapter
  rateLimit: FeedbackRateLimitAdapter
  issueSink: FeedbackIssueSink
  notifications?: readonly FeedbackNotificationRule[]
  appName?: string
  maxBodyBytes?: number
  includeUserAgent?: boolean
  logger?: Pick<Console, 'error'>
}

type FeedbackRouteHandler = (request: Request) => Promise<Response>

const NOINDEX_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow' } as const
const DEFAULT_MAX_BODY_BYTES = 16_384

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...NOINDEX_HEADERS,
      ...headers,
    },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function textToHtmlParagraph(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />')
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true
  if (normalized === '::1' || normalized === '[::1]') return true

  const parts = normalized.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const first = parts[0] ?? -1
  const second = parts[1] ?? -1
  if (first === 10 || first === 127) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 169 && second === 254) return true
  return false
}

function readOptionalHttpsUrl(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = readOptionalString(record, key, maxLength)
  if (!value) return undefined

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || isPrivateHostname(url.hostname)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

type ValidationResult =
  | { ok: true; value: FeedbackSubmitPayload }
  | { ok: false; message: string }

function validatePayload(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, message: 'Ugyldig forespørsel.' }
  }

  const record = input as Record<string, unknown>
  const rawType = record.type
  if (typeof rawType !== 'string' || !FEEDBACK_TYPES.includes(rawType as FeedbackType)) {
    return { ok: false, message: 'Velg en gyldig type tilbakemelding.' }
  }

  const title = readOptionalString(record, 'title', 200)
  const description = readOptionalString(record, 'description', 5000)
  if (!title || title.length < 3 || !description || description.length < 3) {
    return { ok: false, message: 'Skriv en tittel (minst 3 tegn) og en beskrivelse før du sender.' }
  }

  const page = readOptionalString(record, 'page', 300)
  if (page !== undefined && !page.startsWith('/')) {
    return { ok: false, message: 'Ugyldig sidekontekst.' }
  }

  const imageUrl = readOptionalHttpsUrl(record, 'imageUrl', 2000)
  if (record.imageUrl !== undefined && imageUrl === undefined) {
    return { ok: false, message: 'Ugyldig bilde-URL.' }
  }

  const userAgent = readOptionalString(record, 'userAgent', 400)
  const value: FeedbackSubmitPayload = {
    type: rawType as FeedbackType,
    title,
    description,
  }
  if (page !== undefined) value.page = page
  if (imageUrl !== undefined) value.imageUrl = imageUrl
  if (userAgent !== undefined) value.userAgent = userAgent

  return { ok: true, value }
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim()
  return first || undefined
}

function absolutePageUrl(request: Request, page: string): string {
  const requestUrl = new URL(request.url)
  const proto = firstHeaderValue(request.headers.get('x-forwarded-proto')) ?? requestUrl.protocol.replace(':', '')
  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ??
    firstHeaderValue(request.headers.get('host')) ??
    requestUrl.host
  return `${proto}://${host}${page}`
}

function buildIssue(
  payload: FeedbackSubmitPayload,
  user: FeedbackUser,
  request: Request,
  options: Required<Pick<FeedbackRouteOptions, 'appName' | 'includeUserAgent'>>,
): FeedbackIssue {
  const context: FeedbackContext = { appName: options.appName }
  if (payload.page !== undefined) {
    context.page = payload.page
    context.pageUrl = absolutePageUrl(request, payload.page)
  }
  if (payload.imageUrl !== undefined) {
    context.imageUrl = payload.imageUrl
  }
  if (options.includeUserAgent && payload.userAgent !== undefined) {
    context.userAgent = payload.userAgent
  }

  const contextLines = [
    `App: ${escapeHtml(context.appName)}`,
    `Type: ${escapeHtml(FEEDBACK_TYPE_LABELS[payload.type])}`,
    context.page && context.pageUrl
      ? `Side: <a href="${escapeHtml(context.pageUrl)}">${escapeHtml(context.page)}</a>`
      : null,
    context.imageUrl ? `Bilde: <a href="${escapeHtml(context.imageUrl)}">Vedlagt bilde</a>` : null,
    user.email ? `Rapportert av: ${escapeHtml(user.email)}` : null,
    context.userAgent ? `Nettleser: ${escapeHtml(context.userAgent)}` : null,
  ].filter((line): line is string => line !== null)

  return {
    type: payload.type,
    title: payload.title,
    descriptionText: payload.description,
    descriptionHtml:
      `<p>${textToHtmlParagraph(payload.description)}</p>` +
      `<p>KONTEKST (automatisk):<br />${contextLines.join('<br />')}</p>`,
    reporter: user,
    context,
  }
}

function adapterMissing(options: Partial<FeedbackRouteOptions>): boolean {
  return (
    typeof options.auth !== 'function' ||
    typeof options.rateLimit !== 'function' ||
    typeof options.issueSink !== 'function'
  )
}

function providerStatus(error: unknown): number | undefined {
  if (error instanceof FeedbackSinkError) return error.status
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function isConfigError(error: unknown): boolean {
  return error instanceof FeedbackSinkError && error.configError
}

function notificationMatches(rule: FeedbackNotificationRule, type: FeedbackType): boolean {
  return rule.types === undefined || rule.types.includes(type)
}

async function runNotifications(
  issue: FeedbackIssue,
  request: Request,
  rules: readonly FeedbackNotificationRule[],
  logger: Pick<Console, 'error'>,
): Promise<boolean> {
  for (const rule of rules) {
    if (!notificationMatches(rule, issue.type)) continue

    try {
      await rule.notify(issue, request)
    } catch (error) {
      logger.error('[feedback] varsling feilet', {
        notifier: rule.name,
        required: rule.required ?? false,
        status: providerStatus(error) ?? 'ukjent',
        name: error instanceof Error ? error.name : typeof error,
      })
      if (rule.required) return false
    }
  }

  return true
}

export function createFeedbackPost(options: FeedbackRouteOptions): FeedbackRouteHandler {
  return async function POST(request: Request): Promise<Response> {
    if (adapterMissing(options)) {
      return jsonResponse({ feil: 'Tilbakemelding er ikke riktig konfigurert.' }, 503)
    }

    let user: FeedbackUser | null = null
    try {
      user = await options.auth(request)
    } catch {
      user = null
    }

    if (!user) {
      return jsonResponse({ feil: 'Du må være innlogget for å sende tilbakemelding.' }, 401)
    }

    try {
      const limit = await options.rateLimit(`feedback:${user.id}`, request)
      if (!limit.ok) {
        const retryAfter = String(limit.retryAfterSec ?? 60)
        return jsonResponse(
          { feil: 'For mange tilbakemeldinger på kort tid. Vent litt og prøv igjen.' },
          429,
          { 'Retry-After': retryAfter },
        )
      }
    } catch {
      return jsonResponse({ feil: 'Tilbakemelding er midlertidig utilgjengelig.' }, 503)
    }

    let rawBody = ''
    try {
      rawBody = await request.text()
    } catch {
      return jsonResponse({ feil: 'Ugyldig forespørsel.' }, 400)
    }

    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
    if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) {
      return jsonResponse({ feil: 'Tilbakemeldingen er for stor.' }, 413)
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ feil: 'Ugyldig forespørsel.' }, 400)
    }

    const parsed = validatePayload(parsedJson)
    if (!parsed.ok) {
      return jsonResponse({ feil: parsed.message }, 400)
    }

    const issue = buildIssue(parsed.value, user, request, {
      appName: options.appName ?? 'feedback',
      includeUserAgent: options.includeUserAgent ?? false,
    })
    const logger = options.logger ?? console

    try {
      const createdIssue = await options.issueSink(issue, request)
      if (createdIssue !== undefined) issue.ticket = createdIssue
    } catch (error) {
      logger.error('[feedback] kunne ikke opprette sak', {
        status: providerStatus(error) ?? 'ukjent',
        name: error instanceof Error ? error.name : typeof error,
      })
      if (isConfigError(error) || providerStatus(error) === 503) {
        return jsonResponse({ feil: 'Tilbakemelding er ikke konfigurert i dette miljøet enda.' }, 503)
      }
      return jsonResponse(
        {
          feil: 'Kunne ikke sende tilbakemeldingen akkurat nå. Teksten din er beholdt, prøv igjen om litt.',
        },
        502,
      )
    }

    const notificationsOk = await runNotifications(
      issue,
      request,
      options.notifications ?? [],
      logger,
    )
    if (!notificationsOk) {
      return jsonResponse(
        {
          feil: 'Tilbakemeldingen ble registrert, men varsling feilet. Vi følger den opp.',
        },
        502,
      )
    }

    return jsonResponse({ ok: true }, 201)
  }
}

export function feedbackMethodNotAllowed(): Response {
  return jsonResponse({ feil: 'Bruk POST.' }, 405)
}
