import type {
  Activity,
  DashboardStats,
  Member,
  Page,
  Project,
  ProjectStatus,
  Task,
  TaskPriority,
  TaskStatus,
  TokenResponse,
  User,
} from './types'

const BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)
const API = `${BASE_URL}/api/v1`
const STORAGE_KEY = 'pm.tokens'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// --- token storage -------------------------------------------------------------------

export interface StoredTokens {
  access: string
  refresh: string
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

let tokens: StoredTokens | null = loadTokens()
let onAuthLost: (() => void) | null = null

export function getTokens(): StoredTokens | null {
  return tokens
}

export function setTokens(next: StoredTokens | null): void {
  tokens = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage can be unavailable (private mode); the in-memory copy still works
  }
}

export function setAuthLostHandler(handler: (() => void) | null): void {
  onAuthLost = handler
}

// --- request core --------------------------------------------------------------------

export type Params = Record<string, string | number | null | undefined>

interface RequestOptions {
  method?: string
  body?: unknown
  params?: Params
  auth?: boolean
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorBody | null = null
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    body = null
  }
  const err = body?.error
  return new ApiError(
    res.status,
    err?.code ?? `http_${res.status}`,
    err?.message ?? (res.statusText || 'Request failed'),
    err?.details,
  )
}

let refreshing: Promise<boolean> | null = null

// One refresh at a time: parallel 401s all wait for the same refresh call.
function refreshTokens(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false)
  if (!refreshing) {
    const refresh = tokens.refresh
    refreshing = (async () => {
      try {
        const res = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        })
        if (!res.ok) return false
        const data = (await res.json()) as TokenResponse
        setTokens({ access: data.access_token, refresh: data.refresh_token })
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { method = 'GET', body, params, auth = true } = options
  const url = new URL(`${API}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && tokens) headers.Authorization = `Bearer ${tokens.access}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.')
  }

  if (res.status === 401 && auth && retry && tokens) {
    if (await refreshTokens()) return request<T>(path, options, false)
    setTokens(null)
    onAuthLost?.()
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Turns any thrown error into a message a person can act on. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (err.status === 403) {
    const action = (err.details as { action?: string } | undefined)?.action
    switch (action) {
      case 'task:complete':
        return 'This task cannot be completed yet: it needs an assignee, a description and a due date.'
      case 'task:delete':
        return 'Only the project owner can delete a task, and only while it is still Todo.'
      case 'task:update':
        return 'Only the task creator or its assignee can change this task.'
      case 'project:update':
      case 'project:delete':
        return 'Only the project owner can do that.'
      case 'project:manage_members':
        return 'Only the project owner can manage members.'
      default:
        return err.message
    }
  }
  if (err.status === 422 && Array.isArray(err.details)) {
    const lines = (err.details as { field: string; message: string }[]).map((d) => `${d.field}: ${d.message}`)
    return lines.length > 0 ? lines.join('; ') : err.message
  }
  return err.message
}

// --- endpoints -----------------------------------------------------------------------

export interface TaskInput {
  title: string
  description: string | null
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
}
export type TaskUpdateInput = Partial<TaskInput> & { status?: TaskStatus }

export interface ProjectInput {
  name: string
  description: string | null
}
export type ProjectUpdateInput = Partial<ProjectInput> & { status?: ProjectStatus }

export const api = {
  register: (body: { email: string; name: string; password: string }) =>
    request<User>('/auth/register', { method: 'POST', body, auth: false }),
  login: (body: { email: string; password: string }) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body, auth: false }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: false }),
  me: () => request<User>('/auth/me'),

  stats: () => request<DashboardStats>('/dashboard/stats'),

  projects: (params: Params) => request<Page<Project>>('/projects', { params }),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (body: ProjectInput) => request<Project>('/projects', { method: 'POST', body }),
  updateProject: (id: string, body: ProjectUpdateInput) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  members: (projectId: string) => request<Member[]>(`/projects/${projectId}/members`),
  addMember: (projectId: string, email: string) =>
    request<Member>(`/projects/${projectId}/members`, { method: 'POST', body: { email } }),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
  activity: (projectId: string, params: Params) =>
    request<Page<Activity>>(`/projects/${projectId}/activity`, { params }),

  tasks: (projectId: string, params: Params) =>
    request<Page<Task>>(`/projects/${projectId}/tasks`, { params }),
  task: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (projectId: string, body: TaskInput) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body }),
  updateTask: (id: string, body: TaskUpdateInput) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
}