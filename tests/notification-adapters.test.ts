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
  ticket: {
    id: 'issue-1',
    url: 'https://plane.example.com/workspace/projects/project/issues/issue-1',
    provider: 'Plane',
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
    const body = JSON.parse(String(init.body)) as {
      text: string
      blocks: Array<{ type: string; text?: { text: string }; elements?: Array<{ text?: string }> }>
    }
    expect(body.text).toContain(issue.title)
    expect(issue.ticket?.url).toBeDefined()
    expect(body.text).toContain(issue.ticket!.url!)
    expect(issue.context.pageUrl).toBeDefined()
    expect(body.text).toContain(issue.context.pageUrl!)
    expect(body.text).not.toContain('example.test/slack-webhook')
    expect(body.blocks.map((block) => block.type)).toEqual(['header', 'section', 'context', 'actions'])
    expect(body.blocks[0]?.text?.text).toContain('Ny feil')
    expect(JSON.stringify(body.blocks)).toContain(issue.title)
    expect(JSON.stringify(body.blocks)).toContain('Åpne ticket')
    expect(JSON.stringify(body.blocks)).toContain(issue.ticket!.url!)
    expect(JSON.stringify(body.blocks)).not.toContain('example.test/slack-webhook')
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
