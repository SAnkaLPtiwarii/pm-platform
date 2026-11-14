import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  ErrorState,
  FormError,
  Input,
  PageSpinner,
  PriorityBadge,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui'
import { ApiError, api, errorMessage } from '../lib/api'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, formatDateTime } from '../lib/format'
import type { Member, Task } from '../lib/types'

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().max(5000, 'Description is too long'),
  status: z.enum(['todo', 'in_progress', 'completed']),
  priority: z.enum(['low', 'medium', 'high']),
  assignee_id: z.string(),
  due_date: z.string(),
})
type FormValues = z.infer<typeof schema>

function TaskEditForm({ task, members }: { task: Task; members: Member[] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)
  const canUpdate = task.permissions.update

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      assignee_id: task.assignee?.id ?? '',
      due_date: task.due_date ?? '',
    },
  })

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api.updateTask(task.id, {
        title: values.title,
        description: values.description || null,
        status: values.status,
        priority: values.priority,
        assignee_id: values.assignee_id || null,
        due_date: values.due_date || null,
      }),
    onSuccess: () => {
      toast.success('Task saved')
      void queryClient.invalidateQueries()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    save.mutate(values)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={serverError} />
      {!canUpdate && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only the task creator or its assignee can edit this task.
        </p>
      )}
      <fieldset disabled={!canUpdate} className="space-y-4">
        <Input label="Title" error={errors.title?.message} {...register('title')} />
        <Textarea label="Description" error={errors.description?.message} {...register('description')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Status" error={errors.status?.message} {...register('status')}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select label="Priority" error={errors.priority?.message} {...register('priority')}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select label="Assignee" error={errors.assignee_id?.message} {...register('assignee_id')}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </Select>
          <Input label="Due date" type="date" error={errors.due_date?.message} {...register('due_date')} />
        </div>
      </fieldset>
      {canUpdate && (
        <Button type="submit" loading={save.isPending}>
          Save changes
        </Button>
      )}
    </form>
  )
}

export default function TaskDetails() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const taskQuery = useQuery({ queryKey: ['task', taskId], queryFn: () => api.task(taskId) })
  const projectId = taskQuery.data?.project_id ?? ''
  const membersQuery = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.members(projectId),
    enabled: projectId !== '',
  })

  const remove = useMutation({
    mutationFn: () => api.deleteTask(taskId),
    onSuccess: () => {
      toast.success('Task deleted')
      queryClient.removeQueries({ queryKey: ['task', taskId] })
      void queryClient.invalidateQueries()
      navigate(`/projects/${projectId}`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (taskQuery.isPending) return <PageSpinner label="Loading task..." />
  if (taskQuery.isError) {
    const notFound = taskQuery.error instanceof ApiError && taskQuery.error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Task not found' : 'Something went wrong'}
        message={notFound ? 'It does not exist, or you cannot access its project.' : errorMessage(taskQuery.error)}
        onRetry={notFound ? undefined : () => void taskQuery.refetch()}
        action={
          <Link to="/projects" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            Back to projects
          </Link>
        }
      />
    )
  }

  const task = taskQuery.data

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={`/projects/${task.project_id}`} className="text-sm text-indigo-600 hover:underline">
          Back to project
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Created by {task.created_by.name} on {formatDateTime(task.created_at)} | Updated{' '}
          {formatDateTime(task.updated_at)}
        </p>
      </div>

      <Card>
        {membersQuery.isPending ? (
          <PageSpinner label="Loading..." />
        ) : membersQuery.isError ? (
          <ErrorState message={errorMessage(membersQuery.error)} onRetry={() => void membersQuery.refetch()} />
        ) : (
          <TaskEditForm key={task.updated_at} task={task} members={membersQuery.data} />
        )}
      </Card>

      {task.permissions.delete && (
        <Card>
          <h2 className="font-semibold">Delete task</h2>
          <p className="mt-1 text-sm text-slate-500">This cannot be undone.</p>
          <Button
            variant="danger"
            className="mt-3"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this task?')) remove.mutate()
            }}
          >
            Delete task
          </Button>
        </Card>
      )}
    </div>
  )
}