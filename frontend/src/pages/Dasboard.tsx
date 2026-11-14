import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Card, EmptyState, ErrorState, PageSpinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</p>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['stats'], queryFn: api.stats })

  if (query.isPending) return <PageSpinner label="Loading your dashboard..." />
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />

  const stats = query.data
  const percent = stats.total_tasks === 0 ? 0 : Math.round((stats.completed_tasks / stats.total_tasks) * 100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {user?.name}</h1>
        <p className="text-slate-500">Here is where your projects stand.</p>
      </div>

      {stats.total_projects === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start tracking tasks."
          action={
            <Link to="/projects" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
              Go to projects
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total projects" value={stats.total_projects} tone="text-slate-900" />
            <StatCard label="Active projects" value={stats.active_projects} tone="text-indigo-600" />
            <StatCard label="Total tasks" value={stats.total_tasks} tone="text-slate-900" />
            <StatCard label="Completed tasks" value={stats.completed_tasks} tone="text-green-600" />
            <StatCard label="Pending tasks" value={stats.pending_tasks} tone="text-amber-600" />
          </div>
          <Card>
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-medium">Overall progress</span>
              <span className="text-slate-500">{percent}% of tasks completed</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-green-500" style={{ width: `${percent}%` }} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}