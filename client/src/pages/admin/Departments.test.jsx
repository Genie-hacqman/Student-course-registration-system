import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { ADMIN, REGISTRAR, departmentRows, page } from '../../test/directoryFixtures'
import Departments from './Departments'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'get').mockImplementation(async () => page(departmentRows))
})

describe('Departments page', () => {
  it('shows each department with its counts and status', async () => {
    auth.user = REGISTRAR
    renderWithProviders(<Departments />)
    const row = (await screen.findByText('Computer Science')).closest('tr')
    expect(within(row).getByText('7')).toBeInTheDocument() // courses
    expect(within(row).getByText('Active')).toBeInTheDocument()
    expect(within(screen.getByText('Mathematics').closest('tr')).getByText('Archived')).toBeInTheDocument()
  })

  it('registrars browse only: no create, edit, archive or delete', async () => {
    auth.user = REGISTRAR
    renderWithProviders(<Departments />)
    await screen.findByText('Computer Science')
    expect(screen.queryByRole('button', { name: /new department/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive cs/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete cs/i })).not.toBeInTheDocument()
  })

  it('admins can archive, after a confirmation that explains what archiving does', async () => {
    auth.user = ADMIN
    const user = userEvent.setup()
    renderWithProviders(<Departments />)
    await user.click(await screen.findByRole('button', { name: 'Archive CS' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/closed to new intake/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Archive department' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate MATH' })).toBeInTheDocument() // archived one offers activate
  })
})
