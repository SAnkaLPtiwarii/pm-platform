import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { api, errorMessage } from '../../lib/api'
import type { Project } from '../../lib/types'
import { useToast } from '../Toast'
import { Button, Card, FormError, Input, Select, Textarea } from '../ui'

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(150, 'Name is too long'),
  description: z.string().max(5000, 'Description is too long'),
  status: z.enum(['active', 'archived']),
})
type FormValues = z.infer<typeof schema>

export default function SettingsPanel({ project }: { project: Project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: project.name, description: project.description ?? '', status: project.status },
  })

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api.updateProject(project.id, {
        name: values.name,
        description: values.description || null,
        status: values.status,
      }),
    onSuccess: () => {
      toast.success('Project updated')
      void queryClient.invalidateQueries()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      toast.success('Project deleted')
      queryClient.removeQueries({ queryKey: ['project', project.id] })
      void queryClient.invalidateQueries()
      navigate('/projects')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    save.mutate(values)
  })

  return (
    <div className="space-y-4">
      {project.permissions.update && (
        <Card>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormError message={serverError} />
            <Input label="Name" error={errors.name?.message} {...register('name')} />
            <Textarea label="Description" error={errors.description?.message} {...register('description')} />
            <Select label="Status" error={errors.status?.message} {...register('status')}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
          </form>
        </Card>
      )}

      {project.permissions.delete && (
        <Card>
          <h2 className="font-semibold">Delete project</h2>
          <p className="mt-1 text-sm text-slate-500">This permanently deletes the project and all of its tasks.</p>
          <Button
            variant="danger"
            className="mt-3"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete "${project.name}" and all of its tasks?`)) remove.mutate()
            }}
          >
            Delete project
          </Button>
        </Card>
      )}
    </div>
  )
}