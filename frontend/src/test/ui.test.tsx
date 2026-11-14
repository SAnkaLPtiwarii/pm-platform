import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState, PriorityBadge, StatusBadge } from '../components/ui'

describe('EmptyState', () => {
  it('shows the title, description and action', () => {
    render(<EmptyState title="No projects yet" description="Create one" action={<button>New</button>} />)
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    expect(screen.getByText('Create one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })
})

describe('badges', () => {
  it('render human-readable labels', () => {
    render(
      <>
        <StatusBadge status="in_progress" />
        <PriorityBadge priority="high" />
      </>,
    )
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
  })
})