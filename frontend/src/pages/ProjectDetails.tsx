import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ActivityPanel from '../components/project/ActivityPanel'
import MembersPanel from '../components/project/MembersPanel'
import SettingsPanel from '../components/project/SettingsPanel'
import TasksPanel from '../components/project/TasksPanel'
import { ErrorState, PageSpinner, ProjectStatusBadge } from '../components/ui'
import { ApiError, api, errorMessage } from '../lib/api'

type Tab = 'tasks' | 'members' | 'activity' | 'settings'

export default function ProjectDetails() {
  const { projectId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('tasks')
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward')
  const query = useQuery({ queryKey: ['project', projectId], queryFn: () => api.project(projectId) })

  if (query.isPending) return <PageSpinner label="Loading project..." />
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Project not found' : 'Something went wrong'}
        message={notFound ? 'It does not exist, or you are not a member of it.' : errorMessage(query.error)}
        onRetry={notFound ? undefined : () => void query.refetch()}
        action={
          <Link to="/projects" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            Back to projects
          </Link>
        }
      />
    )
  }

  const project = query.data
  const tabs: { id: Tab; label: string }[] = [
    { id: 'tasks', label: 'Tasks' },
    { id: 'members', label: `Members (${project.member_count})` },
    { id: 'activity', label: 'Activity' },
  ]
  if (project.permissions.update || project.permissions.delete) tabs.push({ id: 'settings', label: 'Settings' })

  function changeTab(nextTab: Tab) {
    const currentIndex = tabs.findIndex((item) => item.id === tab)
    const nextIndex = tabs.findIndex((item) => item.id === nextTab)
    if (currentIndex !== nextIndex) setTabDirection(nextIndex > currentIndex ? 'forward' : 'backward')
    setTab(nextTab)
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-indigo-600 hover:underline">
          Back to projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.description && <p className="mt-1 text-slate-600">{project.description}</p>}
        <p className="mt-1 text-sm text-slate-500">
          {project.completed_task_count}/{project.task_count} tasks completed
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => changeTab(item.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none ${
              tab === item.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div key={tab} className={`tab-transition-${tabDirection}`}>
        {tab === 'tasks' && <TasksPanel project={project} />}
        {tab === 'members' && <MembersPanel project={project} />}
        {tab === 'activity' && <ActivityPanel projectId={project.id} />}
        {tab === 'settings' && <SettingsPanel project={project} />}
      </div>
    </div>
  )
}