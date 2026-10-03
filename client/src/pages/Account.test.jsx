import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import Account from './Account'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth }))
// Only the Profile tab's picture card is under test; the other sections need their own data.
vi.mock('../components/account/AvatarUploader', () => ({ default: () => <div>uploader</div> }))
vi.mock('../components/account/Account', () => ({ Sessions: () => null }))
vi.mock('../components/account/ChangeRequests', () => ({ default: () => null }))

const person = { firstName: 'Ada', lastName: 'Applicant', email: 'ada@personal.test' }

describe('Account: profile picture note', () => {
  it('tells an applicant or student their profile picture is separate from the official application photo', () => {
    auth.user = { ...person, role: { name: 'STUDENT' } }
    renderWithProviders(<Account />)
    expect(screen.getByText(/separate from the official photo on your admission application/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be changed once you have submitted/i)).toBeInTheDocument()
  })

  it('does not mention an admission application to staff, who have none', () => {
    auth.user = { ...person, role: { name: 'LECTURER' } }
    renderWithProviders(<Account />)
    expect(screen.getByText(/you can change or remove it any time/i)).toBeInTheDocument()
    expect(screen.queryByText(/admission application/i)).not.toBeInTheDocument()
  })
})
