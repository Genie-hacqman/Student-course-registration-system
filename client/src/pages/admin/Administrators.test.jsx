import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { ADMIN, page, plain } from '../../test/directoryFixtures'
import Administrators from './Administrators'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

const staff = [
  { id: 1, firstName: 'System', lastName: 'Administrator', email: 'admin@scrs.local', status: 'active', role: { name: 'ADMIN' }, lastLoginAt: null },
  { id: 4, firstName: 'Esi', lastName: 'Boateng', email: 'registrar@scrs.local', status: 'active', role: { name: 'REGISTRAR' }, lastLoginAt: null },
]
const responsibilities = [
  { role: 'ADMIN', permissions: [{ name: 'user:manage', group: 'System', description: 'Manage user accounts, students and lecturers' }] },
  { role: 'REGISTRAR', permissions: [{ name: 'section:manage', group: 'Academic structure', description: 'Manage course sections and timetables' }] },
]

let get
beforeEach(() => {
  vi.restoreAllMocks()
  get = vi.spyOn(api, 'get').mockImplementation(async (path) => (path === '/users/role-responsibilities' ? plain(responsibilities) : page(staff)))
})

describe('Administrators & Registrars', () => {
  it('lists only staff accounts, with each role\'s responsibilities', async () => {
    auth.user = ADMIN
    renderWithProviders(<Administrators />)
    expect(await screen.findByText('registrar@scrs.local')).toBeInTheDocument()
    await waitFor(() => expect(get.mock.calls.find(([p]) => p === '/users')?.[1]?.params?.role).toBe('ADMIN,REGISTRAR'))
    expect(await screen.findByText('Manage course sections and timetables')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite staff member/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Suspend' })).toHaveLength(1)
  })

  it('anyone else with account access sees it read-only', async () => {
    auth.user = { id: 9, role: { name: 'REGISTRAR' }, permissions: ['user:manage'] }
    renderWithProviders(<Administrators />)
    expect(await screen.findByText('registrar@scrs.local')).toBeInTheDocument()
    expect(screen.getByText(/only administrators can add, change or suspend/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /invite staff member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument()
  })
})
