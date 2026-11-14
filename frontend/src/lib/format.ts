import type { Activity, TaskPriority, TaskStatus } from './types'

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'completed']
export const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ActivityDetail {
  title?: string
  name?: string
  fields?: string[]
  status?: { from: string; to: string }
  tasks_unassigned?: number
}

function statusLabel(value: string): string {
  return STATUS_LABEL[value as TaskStatus] ?? value
}

export function describeActivity(activity: Activity): string {
  const d = (activity.detail ?? {}) as ActivityDetail
  const fields = d.fields?.join(', ') ?? ''
  switch (activity.action) {
    case 'project.created':
      return `created the project "${d.name ?? ''}"`
    case 'project.updated':
      return `updated the project (${fields})`
    case 'project.deleted':
      return 'deleted the project'
    case 'member.added':
      return 'added a member to the project'
    case 'member.removed':
      return d.tasks_unassigned
        ? `removed a member (${d.tasks_unassigned} task(s) unassigned)`
        : 'removed a member from the project'
    case 'task.created':
      return `created the task "${d.title ?? ''}"`
    case 'task.updated':
      return d.status
        ? `moved a task from ${statusLabel(d.status.from)} to ${statusLabel(d.status.to)}`
        : `updated a task (${fields})`
    case 'task.deleted':
      return `deleted the task "${d.title ?? ''}"`
    default:
      return activity.action
  }
}