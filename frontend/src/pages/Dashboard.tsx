import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Card, EmptyState, ErrorState, PageSpinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'

function StatCard({
  label,
  value,
  caption,
  icon,
  tone,
}: {
  label: string
  value: number
  caption: string
  icon: string
  tone: string
}) {
  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-5 text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d={icon}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['stats'], queryFn: api.stats })

  if (query.isPending) return <PageSpinner label="Loading your dashboard..." />
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />

  const stats = query.data
  const percent =
    stats.total_tasks === 0 ? 0 : Math.round((stats.completed_tasks / stats.total_tasks) * 100)

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-700 to-violet-800 p-6 text-white shadow-lg shadow-indigo-900/10 sm:p-8 lg:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[30px] border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-32 h-52 w-52 rounded-full bg-fuchsia-400/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Workspace overview
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Good to see you, {user?.name ?? 'there'}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100 sm:text-base">
              Your projects, tasks, and team progress—all in one place.
            </p>
          </div>
          <Link
            to="/projects"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
          >
            View projects
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M3.5 10h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total projects"
          value={stats.total_projects}
          caption="In your workspace"
          icon="M3.75 7.25h6l2 2h8.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5v-10.5Z"
          tone="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Active projects"
          value={stats.active_projects}
          caption="Ready for work"
          icon="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm-3.5 8.5 2.25 2.25 4.75-5"
          tone="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Total tasks"
          value={stats.total_tasks}
          caption="Across all projects"
          icon="M8.5 6h11M8.5 12h11M8.5 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"
          tone="bg-sky-50 text-sky-600"
        />
        <StatCard
          label="Completed"
          value={stats.completed_tasks}
          caption="Nice work"
          icon="m5 12.5 4.25 4.25L19 7"
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Pending"
          value={stats.pending_tasks}
          caption="Still on your list"
          icon="M12 8v4l2.75 1.75M20.25 12a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z"
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {stats.total_projects === 0 && (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start tracking tasks."
          action={
            <Link
              to="/projects"
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Create a project
            </Link>
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Overall progress</p>
              <p className="mt-1 text-sm text-slate-500">Completed tasks across your workspace</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-indigo-700">{percent}%</p>
          </div>
          <div
            className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Completed tasks"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {stats.completed_tasks} of {stats.total_tasks} tasks completed
          </p>
        </Card>

        <Card className="relative overflow-hidden border-indigo-100 bg-indigo-50/70 p-5 sm:p-6">
          <div aria-hidden="true" className="absolute -bottom-10 -right-8 h-32 w-32 rounded-full bg-violet-200/50 blur-2xl" />
          <div className="relative">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="mt-4 font-semibold text-slate-900">Keep momentum going</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {stats.total_projects === 0
                ? 'Start with a project, then invite your team and turn the plan into tasks.'
                : 'Review your projects, update task statuses, and keep everyone moving together.'}
            </p>
            <Link
              to="/projects"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
            >
              {stats.total_projects === 0 ? 'Get started' : 'Manage projects'}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}