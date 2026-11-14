import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { Project } from '../../lib/types'
import { useToast } from '../Toast'
import { Button, Card, ErrorState, FormError, Input, PageSpinner } from '../ui'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export default function MembersPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)
  const canManage = project.permissions.manage_members
  const members = useQuery({ queryKey: ['members', project.id], queryFn: () => api.members(project.id) })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const add = useMutation({
    mutationFn: (values: FormValues) => api.addMember(project.id, values.email),
    onSuccess: () => {
      toast.success('Member added')
      reset()
      void queryClient.invalidateQueries()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(project.id, userId),
    onSuccess: () => {
      toast.success('Member removed')
      void queryClient.invalidateQueries()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    add.mutate(values)
  })

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-3">
            <div className="min-w-64 flex-1">
              <FormError message={serverError} />
              <Input label="Add a member by email" type="email" error={errors.email?.message} {...register('email')} />
            </div>
            <Button type="submit" loading={add.isPending} className="mt-6">
              Add member
            </Button>
          </form>
        </Card>
      )}

      {members.isPending ? (
        <PageSpinner label="Loading members..." />
      ) : members.isError ? (
        <ErrorState message={errorMessage(members.error)} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {members.data.map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">
                  {member.name}
                  {member.is_owner && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">Owner</span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {member.email} | joined {formatDate(member.joined_at)}
                </p>
              </div>
              {canManage && !member.is_owner && (
                <Button
                  variant="danger"
                  loading={remove.isPending && remove.variables === member.user_id}
                  onClick={() => {
                    if (window.confirm(`Remove ${member.name}? Their tasks become unassigned.`)) {
                      remove.mutate(member.user_id)
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}