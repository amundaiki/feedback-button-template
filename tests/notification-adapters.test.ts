import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmailNotifier } from '../src/server/adapters/email'
import {
  createSlackWebhookNotifier,
  createSlackWebhookNotifierFromEnv,
} from '../src/server/adapters/slack'
import type { FeedbackEmailMessage } from '../src/server/adapters/email'
import type { FeedbackIssue } from '../src/server/types'

const issue: FeedbackIssue = {
  type: 'bug',
  title: 'Lagersiden viser feil antall',
  descriptionText: 'Antall stemmer ikke.',
  descriptionHtml: '<p>Antall stemmer ikke.</p>',
  reporter: { id: 'user-1', email: 'tester@example.com' },
  context: {
    appName: 'test-admin',
    page: '/admin/lager',
    pageUrl: 'https://admin.example.com/admin/lager',
  },
}

describe('Slack notifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returnerer null naar env mangler', () => {
    expect(createSlackWebhookNotifierFromEnv({ env: {} })).toBeNull()
  })

  it('sender kort Slack-payload uten aa eksponere webhook i meldingen', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const notifier = createSlackWebhookNotifier({
      webhookUrl: 'https://example.test/slack-webhook',
      types: ['bug'],
    })

    await notifier.notify(issue, new Request('https://example.com'))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/slack-webhook',
      expect.objectContaining({ method: 'POST' }),
    )
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const init = firstCall![1] as RequestInit
    const body = JSON.parse(String(init.body)) as { text: string }
    expect(body.text).toContain(issue.title)
    expect(issue.context.pageUrl).toBeDefined()
    expect(body.text).toContain(issue.context.pageUrl!)
    expect(body.text).not.toContain('example.test/slack-webhook')
  })
})

describe('Email notifier', () => {
  it('bygger e-postmelding via prosjektets egen sender', async () => {
    const sendEmail = vi.fn(async (_message: FeedbackEmailMessage) => undefined)
    const notifier = createEmailNotifier({
      to: ['ops@example.com'],
      from: 'noreply@example.com',
      types: ['bug'],
      sendEmail,
    })

    await notifier.notify(issue, new Request('https://example.com'))

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ops@example.com'],
        from: 'noreply@example.com',
        replyTo: 'tester@example.com',
        subject: expect.stringContaining(issue.title),
        text: expect.stringContaining(issue.context.pageUrl!),
        html: issue.descriptionHtml,
      }),
    )
  })
})
