import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, Select } from './ui'

describe('form fields', () => {
  it('announces an Input error with the field, and marks it invalid', () => {
    render(<Input label="Email" error="Enter a valid email" />)
    const input = screen.getByLabelText(/email/i)
    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Enter a valid email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', message.id)
  })

  it('describes an Input by its hint when there is no error, and not at all when there is neither', () => {
    const { rerender } = render(<Input label="Password" hint="At least 8 characters" />)
    const input = screen.getByLabelText(/password/i)
    expect(input).toHaveAttribute('aria-describedby', screen.getByText('At least 8 characters').id)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    rerender(<Input label="Password" />)
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('flags a Select error the same way', () => {
    render(<Select label="Programme" error="Choose a programme"><option value="">Pick one</option></Select>)
    const select = screen.getByLabelText(/programme/i)
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAttribute('aria-describedby', screen.getByRole('alert').id)
  })
})
