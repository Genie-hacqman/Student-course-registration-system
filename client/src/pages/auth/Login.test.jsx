import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import Login from './Login'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ login: vi.fn() }) }))

beforeEach(() => localStorage.clear())

const applyLinks = () => screen.queryAllByRole('link', { name: /apply for admission/i })

describe('Login footer', () => {
  it('invites visitors to apply for admission, as links to the application page', () => {
    renderWithProviders(<Login />)
    expect(screen.getByText('Want to study with us?')).toBeInTheDocument()
    expect(applyLinks()).toHaveLength(2)
    for (const link of applyLinks()) expect(link).toHaveAttribute('href', '/apply')
  })

  it('shows it to applicants too, but not to staff', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />)
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    expect(applyLinks()).toHaveLength(2)

    await user.click(screen.getByRole('tab', { name: 'Staff' }))
    expect(applyLinks()).toHaveLength(0)
    expect(screen.queryByText('Want to study with us?')).not.toBeInTheDocument()
  })

  it('tells newly admitted students to activate their account first, on the student tab only', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />)
    expect(screen.getByText(/newly admitted\? activate your account/i)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    expect(screen.queryByText(/newly admitted/i)).not.toBeInTheDocument()
  })
})
