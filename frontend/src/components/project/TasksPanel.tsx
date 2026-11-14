import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { useDebounced } from '../../lib/hooks'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, formatDate } from '../../lib/format'
import type { Project, Task, TaskPriority, TaskStatus } from '../../lib/types'
import { useToast } from '../Toast'
import { Button, EmptyState, ErrorState, Input, PageSpinner, Pagination, PriorityBadge, Select } from '../ui'
import TaskBoard from './TaskBoard'
import TaskCreateForm from './TaskCreateForm'

const LIST_PAGE_SIZE = 10
const BOARD_LIMIT = 100

export default function TasksPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [view, setView] = useState<'list' | 'board'>('list')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const debouncedSearch = useDebounced(search)

  const isList = view === 'list'
  const params = {
    page: isList ? page : 1,
    page_size: isList ? LIST_PAGE_SIZE : BOARD_LIMIT,
    search: debouncedSearch,
    status: isList ? status : '',
    priority,
  }

  const query = useQuery({
    queryKey: ['tasks', project.id, view, params],
    queryFn: () => api.tasks(project.id, params),
    placeholderData: keepPreviousData,
  })

  const move = useMutation({
    mutationFn: ({ task, next }: { task: Task; next: TaskStatus }) => api.updateTask(task.id, { status: next }),
    onSuccess: () => {
      toast.success('Status updated')
      void queryClient.invalidateQueries()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const filtered = debouncedSearch !== '' || priority !== '' || (isList && status !== '')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
          {(['list', 'board'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`rounded px-3 py-1.5 font-medium capitalize ${
                view === value ? 'bg-indigo-600 text-white' : 'text-slate-600'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowForm((open) => !open)}>{showForm ? 'Close' : 'New task'}</Button>
      </div>

      {showForm && <TaskCreateForm projectId={project.id} onDone={() => setShowForm(false)} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Search"
          name="task-search"
          placeholder="Title or description"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        {isList && (
          <Select
            label="Status"
            name="task-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as TaskStatus | '')
              setPage(1)
            }}
          >
            <option value="">All</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Priority"
          name="task-priority"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value as TaskPriority | '')
            setPage(1)
          }}
        >
          <option value="">All</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <PageSpinner label="Loading tasks..." />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No tasks match your filters' : 'No tasks yet'}
          description={filtered ? 'Try clearing a filter.' : 'Create the first task for this project.'}
        />
      ) : isList ? (
        <>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {query.data.items.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link to={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                    {task.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <PriorityBadge priority={task.priority} />
                    <span>{task.assignee?.name ?? 'Unassigned'}</span>
                    {task.due_date && <span>Due {formatDate(task.due_date)}</span>}
                  </div>
                </div>
                <select
                  aria-label={`Status of ${task.title}`}
                  value={task.status}
                  disabled={!task.permissions.update || move.isPending}
                  onChange={(event) => move.mutate({ task, next: event.target.value as TaskStatus })}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={LIST_PAGE_SIZE} total={query.data.total} onChange={setPage} />
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">Drag a card to another column to change its status.</p>
          <TaskBoard
            tasks={query.data.items}
            onMove={(task, next) => move.mutate({ task, next })}
            pendingId={move.isPending ? (move.variables?.task.id ?? null) : null}
          />
          {query.data.total > BOARD_LIMIT && (
            <p className="text-xs text-slate-500">
              Showing the first {BOARD_LIMIT} of {query.data.total} tasks. Use search or priority to narrow down.
            </p>
          )}
        </>
      )}
    </div>
  )
}