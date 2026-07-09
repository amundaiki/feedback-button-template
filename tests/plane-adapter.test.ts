import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPlaneIssueSink, planeConfigFromEnv } from '../src/server/adapters/plane'
import type { FeedbackIssue } from '../src/server/types'

const issue: FeedbackIssue = {
  type: 'bug',
  title: 'Lagersiden viser feil antall',
  descriptionText: 'Antall stemmer ikke.',
  descriptionHtml: '<p>Antall stemmer ikke.</p>',
  reporter: { id: 'user-1', email: 'tester@example.com' },
  context: { appName: 'test-admin', page: '/admin/lager' },
}

type FetchStub = (url: string, init?: RequestInit) => { status?: number; json?: unknown }

function stubFetch(handler: FetchStub) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = handler(String(input), init)
    return new Response(JSON.stringify(response.json ?? {}), {
      status: response.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function planeOk(): FetchStub {
  return (url, init) => {
    if (url.includes('/states/')) return { json: [{ id: 'state-backlog', group: 'backlog' }] }
    if (url.includes('/labels/') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string }
      return { json: { id: `label-${body.name}` } }
    }
    if (url.includes('/labels/')) return { json: { results: [{ id: 'label-bug', name: 'bug' }] } }
    if (url.includes('/issues/')) return { json: { id: 'issue-1' } }
    return { status: 404 }
  }
}

describe('planeConfigFromEnv', () => {
  it('returnerer null naar noekkel mangler', () => {
    expect(planeConfigFromEnv({ PLANE_PROJECT_ID: 'project-1' })).toBeNull()
  })

  it('leser server-only konfig fra env', () => {
    expect(
      planeConfigFromEnv({
        PLANE_API_KEY: 'test-key',
        PLANE_PROJECT_ID: 'project-1',
        PLANE_WORKSPACE_SLUG: 'workspace',
        PLANE_BASE_URL: 'https://plane.example.com/',
      }),
    ).toEqual({
      apiKey: 'test-key',
      projectId: 'project-1',
      workspaceSlug: 'workspace',
      baseUrl: 'https://plane.example.com',
    })
  })
})

describe('createPlaneIssueSink', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('feiler lukket naar config mangler', async () => {
    await expect(createPlaneIssueSink(null)(issue, new Request('https://example.com'))).rejects.toMatchObject({
      status: 503,
      configError: true,
    })
  })

  it('oppretter Plane-issue med backlog-state og labels', async () => {
    const fetchMock = stubFetch(planeOk())
    const sink = createPlaneIssueSink({
      baseUrl: 'https://plane.example.com',
      apiKey: 'test-key',
      workspaceSlug: 'workspace',
      projectId: 'project-1',
    })

    await expect(sink(issue, new Request('https://example.com'))).resolves.toEqual({ id: 'issue-1' })
    const issueCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/issues/'))
    expect(issueCall).toBeDefined()
    const body = JSON.parse(String(issueCall?.[1]?.body)) as {
      name: string
      description_html: string
      state: string
      labels: string[]
    }
    expect(body.name).toBe(issue.title)
    expect(body.description_html).toBe(issue.descriptionHtml)
    expect(body.state).toBe('state-backlog')
    expect(body.labels).toEqual(['label-fra-tester', 'label-bug'])
  })
})
