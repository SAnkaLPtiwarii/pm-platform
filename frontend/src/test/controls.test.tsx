import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chips, Segmented } from '../components/ui'

const OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

describe('Segmented', () => {
  it('marks the current value and reports a new choice', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Status" value="todo" options={OPTIONS} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Todo' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Completed' }))
    expect(onChange).toHaveBeenCalledWith('completed')
  })

  it('does not fire when the current value is clicked again', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Status" value="todo" options={OPTIONS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Todo' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores clicks while disabled', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Status" value="todo" options={OPTIONS} onChange={onChange} disabled />)
    await userEvent.click(screen.getByRole('radio', { name: 'Completed' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Chips', () => {
  it('shows its label and reports a new choice', async () => {
    const onChange = vi.fn()
    render(<Chips label="Priority" value="" options={[{ value: '', label: 'Any' }, { value: 'high', label: 'High' }]} onChange={onChange} />)
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'High' }))
    expect(onChange).toHaveBeenCalledWith('high')
  })
})
