import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, FormError, Input } from '../components/ui'
import { errorMessage } from '../lib/api'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').max(128, 'Password is too long'),
    confirm: z.string().min(1, 'Please repeat the password'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })
type FormValues = z.infer<typeof schema>

export default function Register() {
  const { user, loading, register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && user) return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await registerUser(values.name, values.email, values.password)
      navigate('/', { replace: true })
    } catch (err) {
      setServerError(errorMessage(err))
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-4 text-sm text-slate-500">Start organising your projects.</p>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={serverError} />
          <Input label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Create account
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}