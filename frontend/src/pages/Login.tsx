import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { Button, FormError, Input } from '../components/ui'
import { errorMessage } from '../lib/api'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && user) return <Navigate to="/" replace />
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (err) {
      setServerError(errorMessage(err))
    }
  })

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl md:min-h-[620px] md:grid-cols-2">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950 p-10 text-white md:flex lg:p-14">
          <div aria-hidden="true" className="absolute -right-20 top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
          <div aria-hidden="true" className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full border-[42px] border-white/5" />

          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <path d="M4 7.5h6l2 2H20v8.25A1.25 1.25 0 0 1 18.75 19h-13.5A1.25 1.25 0 0 1 4 17.75V7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M4.5 11h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="font-semibold tracking-wide">PM Platform</p>
              <p className="text-xs text-indigo-100">YOUR PROJECT WORKSPACE</p>
            </div>
          </div>

          <div className="relative my-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">
              Plan with clarity
            </p>
            <h2 className="mt-4 max-w-md text-4xl font-semibold leading-tight lg:text-5xl">
              Make good work easier to move forward.
            </h2>
            <p className="mt-5 max-w-sm leading-7 text-indigo-100/85">
              Bring projects, people, and the next task together in one focused workspace.
            </p>
            <div className="mt-9 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Projects</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Tasks</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Team activity</span>
            </div>
          </div>

          <p className="relative text-xs text-indigo-200/75">A calmer way to keep the whole team aligned.</p>
        </aside>

        <section className="flex min-w-0 items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 md:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path d="M4 7.5h6l2 2H20v8.25A1.25 1.25 0 0 1 18.75 19h-13.5A1.25 1.25 0 0 1 4 17.75V7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M4.5 11h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span className="font-semibold text-slate-900">PM Platform</span>
            </div>

            <div className="mb-8">
              <p className="text-sm font-semibold text-indigo-600">Workspace access</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Welcome back. Pick up where your team left off.
              </p>
            </div>

            <form onSubmit={onSubmit} noValidate className="space-y-5">
              <FormError message={serverError} />
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                error={errors.password?.message}
                {...register('password')}
              />
              <Button
                type="submit"
                loading={isSubmitting}
                className="mt-1 h-11 w-full rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/20 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-indigo-600/30"
              >
                Sign in
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M3.5 10h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </form>

            <div className="my-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">NEW TO PM PLATFORM?</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <p className="text-center text-sm text-slate-600">
              Create a workspace account{' '}
              <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}