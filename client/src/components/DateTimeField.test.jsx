import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DateTimeField from './DateTimeField'

function Harness({ initial = '', onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return <DateTimeField label="Opens" value={value} onChange={(v) => { setValue(v); onChange(v) }} {...props} />
}

describe('DateTimeField', () => {
  it('shows the date and the time in two separate boxes, and no combined one', () => {
    const { container } = render(<Harness initial="2027-05-01T09:30" />)
    const group = screen.getByRole('group', { name: 'Opens' })
    expect(group).toBeInTheDocument()
    expect(screen.getByLabelText('Opens date')).toHaveValue('2027-05-01')
    expect(screen.getByLabelText('Opens time')).toHaveValue('09:30')
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull()
  })

  it('reports one combined value as either box changes, and keeps a half-filled one', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.type(screen.getByLabelText('Opens date'), '2027-05-01')
    expect(onChange).toHaveBeenLastCalledWith('2027-05-01T')
    expect(screen.getByLabelText('Opens time')).toHaveValue('')
    await user.type(screen.getByLabelText('Opens time'), '0930')
    expect(onChange).toHaveBeenLastCalledWith('2027-05-01T09:30')
    await user.clear(screen.getByLabelText('Opens date'))
    expect(onChange).toHaveBeenLastCalledWith('T09:30')
    await user.clear(screen.getByLabelText('Opens time'))
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('shows an error once, under the pair, and marks both boxes invalid', () => {
    render(<Harness initial="2027-05-01T" error="Choose a time" />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('Choose a time')
    for (const name of ['Opens date', 'Opens time']) {
      const box = screen.getByLabelText(name)
      expect(box).toHaveAttribute('aria-invalid', 'true')
      expect(box).toHaveAttribute('aria-describedby', alerts[0].id)
    }
  })

  it('describes the boxes by the hint when there is no error', () => {
    render(<Harness hint="Registration windows can open later" />)
    const hint = screen.getByText('Registration windows can open later')
    expect(screen.getByLabelText('Opens time')).toHaveAttribute('aria-describedby', hint.id)
    expect(screen.getByLabelText('Opens time')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
