import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, formatDate } from '../../lib/format'
import { useDebounced } from '../../lib/hooks'
import type { Project, Task, TaskPriority, TaskStatus } from '../../lib/types'
import { useToast } from '../Toast'
import {
  Button,
  Chips,
  EmptyState,
  ErrorState,
  Input,
  PageSpinner,
  Pagination,
  PriorityBadge,
  Segmented,
} from '../ui'
import TaskBoard from './TaskBoard'
import TaskCreateForm from './TaskCreateForm'

const LIST_PAGE_SIZE = 10
const BOARD_LIMIT = 100

const STATUS_FILTERS: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
]
const PRIORITY_FILTERS: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: 'Any' },
  ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] })),
]
const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))

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
  const pendingId = move.isPending ? (move.variables?.task.id ?? null) : null

  const filtered = debouncedSearch !== '' || priority !== '' || (isList && status !== '')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          className="w-full sm:w-48"
          options={[
            { value: 'list', label: 'List' },
            { value: 'board', label: 'Board' },
          ]}
        />
        <Button className="w-full sm:w-auto" onClick={() => setShowForm((open) => !open)}>
          {showForm ? 'Close' : 'New task'}
        </Button>
      </div>

      {showForm && <TaskCreateForm projectId={project.id} onDone={() => setShowForm(false)} />}

      <div className="space-y-3">
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
          <Chips
            label="Status"
            value={status}
            options={STATUS_FILTERS}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
          />
        )}
        <Chips
          label="Priority"
          value={priority}
          options={PRIORITY_FILTERS}
          onChange={(value) => {
            setPriority(value)
            setPage(1)
          }}
        />
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
          <ul className="divide-y divide-slate-200 border border-slate-200 bg-white">
            {query.data.items.map((task) => (
              <li
                key={task.id}
                className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  task.id === pendingId ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0">
                  <Link
                    to={`/tasks/${task.id}`}
                    className="break-words font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <PriorityBadge priority={task.priority} />
                    <span>{task.assignee?.name ?? 'Unassigned'}</span>
                    {task.due_date && <span>Due {formatDate(task.due_date)}</span>}
                  </div>
                </div>
                <Segmented
                  label={`Status of ${task.title}`}
                  value={task.status}
                  options={STATUS_OPTIONS}
                  disabled={!task.permissions.update || move.isPending}
                  onChange={(next) => move.mutate({ task, next })}
                  className="sm:w-72 sm:shrink-0"
                />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={LIST_PAGE_SIZE} total={query.data.total} onChange={setPage} />
        </>
      ) : (
        <>
          <p className="hidden text-xs text-slate-500 md:block">Drag a card to another column to change its status.</p>
          <p className="text-xs text-slate-500 md:hidden">Use the buttons on a card to move it to another column.</p>
          <TaskBoard tasks={query.data.items} onMove={(task, next) => move.mutate({ task, next })} pendingId={pendingId} />
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
