import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    if (!confirmDeleteOpen) return

    const deleteTrigger = deleteTriggerRef.current
    cancelDeleteRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setConfirmDeleteOpen(false)
        return
      }

      if (event.key !== 'Tab') return
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (!first || !last) {
        event.preventDefault()
        dialogRef.current?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (deleteTrigger?.isConnected) deleteTrigger.focus()
    }
  }, [confirmDeleteOpen])

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
          <button
            ref={deleteTriggerRef}
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded border border-red-700 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete project
          </button>
        </Card>
      )}

      {confirmDeleteOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !remove.isPending) setConfirmDeleteOpen(false)
          }}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-description"
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-700">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 3 2.8 19h18.4L12 3Z" strokeLinejoin="round" />
                <path d="M12 9v4m0 3h.01" strokeLinecap="round" />
              </svg>
            </div>
            <h2 id="delete-project-title" className="mt-4 text-lg font-semibold text-slate-900">
              Are you sure?
            </h2>
            <p id="delete-project-description" className="mt-2 text-sm leading-6 text-slate-600">
              Delete “{project.name}” and all of its tasks? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelDeleteRef}
                type="button"
                disabled={remove.isPending}
                onClick={() => setConfirmDeleteOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete project
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}