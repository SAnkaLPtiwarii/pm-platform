import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormError,
  Input,
  PageSpinner,
  Pagination,
  ProjectStatusBadge,
  Select,
  Textarea,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import type { ProjectStatus } from '../lib/types'

const PAGE_SIZE = 9

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(150, 'Name is too long'),
  description: z.string().max(5000, 'Description is too long'),
})
type FormValues = z.infer<typeof schema>

export default function Projects() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const query = useQuery({
    queryKey: ['projects', page, debouncedSearch, status],
    queryFn: () => api.projects({ page, page_size: PAGE_SIZE, search: debouncedSearch, status }),
    placeholderData: keepPreviousData,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } })

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (project) => {
      toast.success('Project created')
      void queryClient.invalidateQueries()
      reset()
      setShowForm(false)
      navigate(`/projects/${project.id}`)
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    create.mutate({ name: values.name, description: values.description || null })
  })

  const filtered = debouncedSearch !== '' || status !== ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button onClick={() => setShowForm((open) => !open)}>{showForm ? 'Close' : 'New project'}</Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormError message={serverError} />
            <Input label="Name" error={errors.name?.message} {...register('name')} />
            <Textarea label="Description (optional)" error={errors.description?.message} {...register('description')} />
            <Button type="submit" loading={create.isPending}>
              Create project
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Search"
          name="search"
          placeholder="Search by name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <Select
          label="Status"
          name="status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ProjectStatus | '')
            setPage(1)
          }}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {query.isPending ? (
        <PageSpinner label="Loading projects..." />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No projects match your filters' : 'No projects yet'}
          description={filtered ? 'Try a different search or status.' : 'Create a project to get started.'}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.items.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="block">
                <Card className="h-full transition hover:border-indigo-300 hover:shadow">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">{project.name}</h2>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{project.description ?? 'No description'}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    {project.member_count} member(s) | {project.completed_task_count}/{project.task_count} tasks done
                  </p>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}