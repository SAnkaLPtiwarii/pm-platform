import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errorMessage } from '../../lib/api'
import { PRIORITIES, PRIORITY_LABEL } from '../../lib/format'
import { useToast } from '../Toast'
import { Button, Card, FormError, Input, Select, Textarea } from '../ui'

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().max(5000, 'Description is too long'),
  priority: z.enum(['low', 'medium', 'high']),
  assignee_id: z.string(),
  due_date: z.string(),
})
type FormValues = z.infer<typeof schema>

export default function TaskCreateForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api.members(projectId) })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', priority: 'medium', assignee_id: '', due_date: '' },
  })

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createTask(projectId, {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assignee_id: values.assignee_id || null,
        due_date: values.due_date || null,
      }),
    onSuccess: () => {
      toast.success('Task created')
      void queryClient.invalidateQueries()
      onDone()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    create.mutate(values)
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={serverError} />
        <Input label="Title" error={errors.title?.message} {...register('title')} />
        <Textarea label="Description (optional)" error={errors.description?.message} {...register('description')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Priority" error={errors.priority?.message} {...register('priority')}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select label="Assignee" error={errors.assignee_id?.message} {...register('assignee_id')}>
            <option value="">Unassigned</option>
            {members.data?.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </Select>
          <Input label="Due date" type="date" error={errors.due_date?.message} {...register('due_date')} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            Create task
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}