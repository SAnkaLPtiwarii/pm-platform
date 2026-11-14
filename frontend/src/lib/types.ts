export type TaskStatus = 'todo' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'
export type ProjectStatus = 'active' | 'archived'

export interface User {
  id: string
  email: string
  name: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ProjectPermissions {
  update: boolean
  delete: boolean
  manage_members: boolean
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  owner_id: string
  member_count: number
  task_count: number
  completed_task_count: number
  permissions: ProjectPermissions
  created_at: string
  updated_at: string
}

export interface Member {
  user_id: string
  name: string
  email: string
  is_owner: boolean
  joined_at: string
}

export interface UserSummary {
  id: string
  name: string
}

export interface TaskPermissions {
  update: boolean
  delete: boolean
  complete: boolean
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: UserSummary | null
  created_by: UserSummary
  due_date: string | null
  permissions: TaskPermissions
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  action: string
  actor: UserSummary | null
  resource_type: string
  resource_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface DashboardStats {
  total_projects: number
  active_projects: number
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
}