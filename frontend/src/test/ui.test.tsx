import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EmptyState, Input, PriorityBadge, StatusBadge } from '../components/ui'

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

describe('password input', () => {
  it('toggles visibility and keeps the entered value', async () => {
    const user = userEvent.setup()
    render(<Input label="Password" name="password" type="password" defaultValue="secret" />)

    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })
})