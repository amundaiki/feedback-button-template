import { FEEDBACK_TYPES, type FeedbackType } from '../../shared/feedback-types'
import type { FeedbackIssueSink } from '../types'
import { FeedbackSinkError } from '../types'

export type PlaneAdapterConfig = {
  baseUrl: string
  webBaseUrl?: string
  apiKey: string
  workspaceSlug: string
  projectId: string
  fromTesterLabel?: string
  typeLabels?: Partial<Record<FeedbackType, string>>
  requestTimeoutMs?: number
}

type Env = Record<string, string | undefined>

type PlaneIds = {
  backlogStateId: string
  labelIds: Record<string, string>
}

type PlaneListResponse<T> = T[] | { results?: T[] }

const DEFAULT_PLANE_BASE_URL = 'https://prosjekt.example.com'
const DEFAULT_FROM_TESTER_LABEL = 'fra-tester'
const DEFAULT_TIMEOUT_MS = 15_000

export function planeConfigFromEnv(env: Env = process.env): PlaneAdapterConfig | null {
  const apiKey = env.PLANE_API_KEY
  const projectId = env.PLANE_PROJECT_ID
  if (!apiKey || !projectId) return null

  return {
    baseUrl: (env.PLANE_BASE_URL || DEFAULT_PLANE_BASE_URL).replace(/\/+$/, ''),
    webBaseUrl: (env.PLANE_WEB_BASE_URL || env.PLANE_BASE_URL || DEFAULT_PLANE_BASE_URL).replace(
      /\/+$/,
      '',
    ),
    apiKey,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG || 'aiki',
    projectId,
  }
}

function toList<T>(response: PlaneListResponse<T>): T[] {
  if (Array.isArray(response)) return response
  return response.results ?? []
}

async function planeFetch<T>(
  config: PlaneAdapterConfig,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const requestInit: RequestInit = {
    method: init?.method ?? 'GET',
    headers: {
      'X-API-Key': config.apiKey,
      Accept: 'application/json',
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS),
  }
  if (init?.body !== undefined) requestInit.body = JSON.stringify(init.body)

  const response = await fetch(`${config.baseUrl}${path}`, requestInit)

  if (!response.ok) {
    throw new FeedbackSinkError(`Plane request failed with ${response.status}`, {
      status: response.status,
    })
  }

  return (await response.json()) as T
}

async function getBacklogStateId(config: PlaneAdapterConfig): Promise<string> {
  const basePath = `/api/v1/workspaces/${config.workspaceSlug}/projects/${config.projectId}`
  const states = toList(
    await planeFetch<PlaneListResponse<{ id: string; group?: string }>>(
      config,
      `${basePath}/states/`,
    ),
  )
  const backlog = states.find((state) => state.group === 'backlog')
  if (!backlog) throw new FeedbackSinkError('Plane backlog state not found')
  return backlog.id
}

async function getOrCreateLabelIds(
  config: PlaneAdapterConfig,
  names: readonly string[],
): Promise<Record<string, string>> {
  const basePath = `/api/v1/workspaces/${config.workspaceSlug}/projects/${config.projectId}`
  const existingLabels = toList(
    await planeFetch<PlaneListResponse<{ id: string; name: string }>>(
      config,
      `${basePath}/labels/?per_page=200`,
    ),
  )

  const labelIds: Record<string, string> = {}
  for (const name of names) {
    const existing = existingLabels.find((label) => label.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      labelIds[name] = existing.id
      continue
    }

    const created = await planeFetch<{ id: string }>(config, `${basePath}/labels/`, {
      method: 'POST',
      body: { name },
    })
    labelIds[name] = created.id
  }

  return labelIds
}

function labelNameForType(config: PlaneAdapterConfig, type: FeedbackType): string {
  return config.typeLabels?.[type] ?? type
}

function planeIssueUrl(config: PlaneAdapterConfig, issueId: string): string {
  const webBaseUrl = (config.webBaseUrl || config.baseUrl).replace(/\/+$/, '')
  return `${webBaseUrl}/${config.workspaceSlug}/projects/${config.projectId}/issues/${issueId}`
}

export function createPlaneIssueSink(config: PlaneAdapterConfig | null): FeedbackIssueSink {
  let idsPromise: Promise<PlaneIds> | null = null

  async function resolveIds(resolvedConfig: PlaneAdapterConfig): Promise<PlaneIds> {
    if (!idsPromise) {
      idsPromise = (async () => {
        const fromTesterLabel = resolvedConfig.fromTesterLabel ?? DEFAULT_FROM_TESTER_LABEL
        const typeLabels = FEEDBACK_TYPES.map((type) => labelNameForType(resolvedConfig, type))
        return {
          backlogStateId: await getBacklogStateId(resolvedConfig),
          labelIds: await getOrCreateLabelIds(resolvedConfig, [fromTesterLabel, ...typeLabels]),
        }
      })().catch((error) => {
        idsPromise = null
        throw error
      })
    }

    return idsPromise
  }

  return async (issue) => {
    if (!config) {
      throw new FeedbackSinkError('Plane is not configured', { status: 503, configError: true })
    }

    const ids = await resolveIds(config)
    const fromTesterLabel = config.fromTesterLabel ?? DEFAULT_FROM_TESTER_LABEL
    const typeLabel = labelNameForType(config, issue.type)
    const fromTesterId = ids.labelIds[fromTesterLabel]
    const typeId = ids.labelIds[typeLabel]
    if (!fromTesterId || !typeId) {
      throw new FeedbackSinkError('Plane label id missing')
    }

    const basePath = `/api/v1/workspaces/${config.workspaceSlug}/projects/${config.projectId}`
    const created = await planeFetch<{ id: string }>(config, `${basePath}/issues/`, {
      method: 'POST',
      body: {
        name: issue.title,
        description_html: issue.descriptionHtml,
        state: ids.backlogStateId,
        labels: [fromTesterId, typeId],
      },
    })

    return {
      id: created.id,
      url: planeIssueUrl(config, created.id),
      provider: 'Plane',
    }
  }
}
