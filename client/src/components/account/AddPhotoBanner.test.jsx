import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import AddPhotoBanner from './AddPhotoBanner'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

const lecturer = { firstName: 'Kofi', lastName: 'Owusu', role: { name: 'LECTURER' } }

beforeEach(() => sessionStorage.clear())

describe('AddPhotoBanner', () => {
  it('nudges someone without a picture towards their account page', () => {
    auth.user = lecturer
    renderWithProviders(<AddPhotoBanner path="/lecturer/account" />)
    expect(screen.getByRole('link', { name: /add picture/i })).toHaveAttribute('href', '/lecturer/account')
  })

  it('stays away once there is a picture, on the page that has the uploader, and for applicants', () => {
    auth.user = { ...lecturer, avatar: 'data:image/jpeg;base64,X' }
    const { unmount } = renderWithProviders(<AddPhotoBanner path="/lecturer/account" />)
    expect(screen.queryByRole('link', { name: /add picture/i })).not.toBeInTheDocument()
    unmount()

    auth.user = lecturer
    const onPage = renderWithProviders(<AddPhotoBanner path="/lecturer/account" />, { route: '/lecturer/account' })
    expect(screen.queryByRole('link', { name: /add picture/i })).not.toBeInTheDocument()
    onPage.unmount()

    auth.user = { firstName: 'Ada', lastName: 'Applicant', role: { name: 'STUDENT' }, student: null }
    renderWithProviders(<AddPhotoBanner path="/student/settings" />)
    expect(screen.queryByRole('link', { name: /add picture/i })).not.toBeInTheDocument()
  })

  it('can be dismissed, and stays dismissed for the session', async () => {
    auth.user = lecturer
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<AddPhotoBanner path="/lecturer/account" />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('link', { name: /add picture/i })).not.toBeInTheDocument()
    unmount()
    renderWithProviders(<AddPhotoBanner path="/lecturer/account" />)
    expect(screen.queryByRole('link', { name: /add picture/i })).not.toBeInTheDocument()
  })
})
