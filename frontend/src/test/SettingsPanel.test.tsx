import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import SettingsPanel from '../components/project/SettingsPanel'
import { api } from '../lib/api'
import type { Project } from '../lib/types'

const project: Project = {
  id: 'project-1',
  name: 'Roadmap',
  description: null,
  status: 'active',
  owner_id: 'user-1',
  member_count: 1,
  task_count: 2,
  completed_task_count: 0,
  permissions: { update: true, delete: true, manage_members: true },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderSettingsPanel() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ToastProvider>
          <SettingsPanel project={project} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('project deletion confirmation', () => {
  it('does not delete until the modal action is confirmed', async () => {
    const user = userEvent.setup()
    const deleteProject = vi.spyOn(api, 'deleteProject').mockResolvedValue()
    renderSettingsPanel()

    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Are you sure?' })
    expect(dialog).toHaveTextContent('Delete “Roadmap” and all of its tasks?')
    expect(deleteProject).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteProject).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    const reopenedDialog = screen.getByRole('alertdialog', { name: 'Are you sure?' })
    await user.click(within(reopenedDialog).getByRole('button', { name: 'Delete project' }))

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith(project.id))
  })
})
