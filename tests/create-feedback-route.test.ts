import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFeedbackPost, feedbackMethodNotAllowed } from '../src/server/create-feedback-route'
import { createInMemoryRateLimit } from '../src/server/adapters/in-memory-rate-limit'
import { FeedbackSinkError, type FeedbackIssue } from '../src/server/types'

function request(body: unknown): Request {
  return new Request('https://admin.example.com/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'admin.example.com',
    },
    body: JSON.stringify(body),
  })
}

const validBody = {
  type: 'bug',
  title: 'Lagersiden viser feil antall',
  description: 'Antall paa varelinje 3 stemmer ikke.',
  page: '/admin/lager',
}

function route(overrides: Partial<Parameters<typeof createFeedbackPost>[0]> = {}) {
  const issueSink = vi.fn(async (_issue: FeedbackIssue, _request: Request) => ({
    id: 'issue-1',
    url: 'https://plane.example.com/workspace/projects/project/issues/issue-1',
    provider: 'Plane',
  }))
  const logger = { error: vi.fn() }
  const handler = createFeedbackPost({
    auth: async () => ({ id: 'user-1', email: 'tester@example.com' }),
    rateLimit: createInMemoryRateLimit({ limit: 5, windowMs: 60_000 }),
    issueSink,
    logger,
    appName: 'test-admin',
    ...overrides,
  })

  return { handler, issueSink, logger }
}

describe('createFeedbackPost', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('avviser uinnlogget med 401 uten aa kontakte sink', async () => {
    const { handler, issueSink } = route({ auth: async () => null })
    const response = await handler(request(validBody))

    expect(response.status).toBe(401)
    expect(issueSink).not.toHaveBeenCalled()
  })

  it('avviser ugyldig body med 400 og norsk melding', async () => {
    const { handler, issueSink } = route()
    const response = await handler(request({ type: 'bug', title: 'a', description: '' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ feil: expect.stringContaining('tittel') })
    expect(issueSink).not.toHaveBeenCalled()
  })

  it('lager issue med escaped HTML og absolutt side-url', async () => {
    const { handler, issueSink } = route()
    const response = await handler(
      request({
        ...validBody,
        description: '<script>alert(1)</script>',
      }),
    )

    expect(response.status).toBe(201)
    const firstCall = issueSink.mock.calls[0]
    expect(firstCall).toBeDefined()
    const issue = firstCall![0]
    expect(issue.descriptionHtml).not.toContain('<script>')
    expect(issue.descriptionHtml).toContain('&lt;script&gt;')
    expect(issue.descriptionHtml).toContain(
      '<a href="https://admin.example.com/admin/lager">/admin/lager</a>',
    )
    expect(issue.reporter.email).toBe('tester@example.com')
  })

  it('rate-limiter samme bruker', async () => {
    const { handler } = route({
      rateLimit: createInMemoryRateLimit({ limit: 1, windowMs: 60_000 }),
    })

    expect((await handler(request(validBody))).status).toBe(201)
    const response = await handler(request(validBody))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
  })

  it('avviser for stor body foer sink kalles', async () => {
    const { handler, issueSink } = route({ maxBodyBytes: 20 })
    const response = await handler(request(validBody))

    expect(response.status).toBe(413)
    expect(issueSink).not.toHaveBeenCalled()
  })

  it('oppretter issue foer matchende varsler slik at varsler faar ticket-lenke', async () => {
    const events: string[] = []
    const notify = vi.fn(async (issue: FeedbackIssue) => {
      events.push('notify')
      expect(issue.ticket?.url).toBe('https://plane.example.com/workspace/projects/project/issues/issue-1')
    })
    const issueSink = vi.fn(async (_issue: FeedbackIssue, _request: Request) => {
      events.push('issue')
      return {
        id: 'issue-1',
        url: 'https://plane.example.com/workspace/projects/project/issues/issue-1',
        provider: 'Plane',
      }
    })
    const { handler } = route({
      notifications: [{ name: 'slack-bug', types: ['bug'], notify }],
      issueSink,
    })

    const response = await handler(request(validBody))

    expect(response.status).toBe(201)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['issue', 'notify'])
  })

  it('hopper over varsler som ikke matcher type', async () => {
    const notify = vi.fn(async () => undefined)
    const { handler } = route({
      notifications: [{ name: 'bug-only', types: ['bug'], notify }],
    })

    const response = await handler(request({ ...validBody, type: 'forbedring' }))

    expect(response.status).toBe(201)
    expect(notify).not.toHaveBeenCalled()
  })

  it('lar optional varslingsfeil passere, men logger redigert', async () => {
    const { handler, issueSink, logger } = route({
      notifications: [
        {
          name: 'slack',
          notify: async () => {
            throw new FeedbackSinkError('webhook secret response', { status: 500 })
          },
        },
      ],
    })

    const response = await handler(request(validBody))

    expect(response.status).toBe(201)
    expect(issueSink).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      '[feedback] varsling feilet',
      expect.objectContaining({ notifier: 'slack', status: 500 }),
    )
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('webhook secret response')
  })

  it('beholder opprettet issue naar required varsling feiler', async () => {
    const { handler, issueSink } = route({
      notifications: [
        {
          name: 'email',
          required: true,
          notify: async () => {
            throw new Error('smtp token leaked by provider')
          },
        },
      ],
    })

    const response = await handler(request(validBody))
    const responseText = await response.text()

    expect(response.status).toBe(502)
    expect(issueSink).toHaveBeenCalledTimes(1)
    expect(responseText).not.toContain('smtp token')
  })

  it('svarer 502 uten aa lekke sink-feil', async () => {
    const { handler, logger } = route({
      issueSink: async () => {
        throw new Error('provider returned secret-token')
      },
    })

    const response = await handler(request(validBody))
    const responseText = await response.text()

    expect(response.status).toBe(502)
    expect(responseText).not.toContain('secret-token')
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret-token')
  })
})

describe('feedbackMethodNotAllowed', () => {
  it('svarer 405', () => {
    expect(feedbackMethodNotAllowed().status).toBe(405)
  })
})
