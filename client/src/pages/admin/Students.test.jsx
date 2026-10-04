import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { REGISTRAR, page, plain, student, summary } from '../../test/directoryFixtures'
import Students from './Students'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

let get
beforeEach(() => {
  vi.restoreAllMocks()
  auth.user = REGISTRAR
  get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/students/summary') return plain(summary)
    if (path === '/students') return page([student])
    if (path === '/semesters') return plain([{ id: 2, name: 'Current Semester', isCurrent: true }])
    if (path === '/departments') return plain(summary.departments.map(({ id, code, name, status }) => ({ id, code, name, status })))
    if (path === '/programs') return plain([{ id: 1, code: 'BSC-CS', name: 'BSc Computer Science' }])
    return plain([])
  })
})
const lastStudentsParams = () => get.mock.calls.filter(([p]) => p === '/students').at(-1)?.[1]?.params

describe('Students page', () => {
  it('lists students with programme, department, admission and the term registration status', async () => {
    renderWithProviders(<Students />)
    expect(await screen.findByText('STU2025001')).toBeInTheDocument()
    for (const header of ['Student ID', 'Programme', 'Department', 'Level', 'Admission', 'Registration']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    const table = screen.getByRole('table')
    expect(within(table).getByText('Staff admission')).toBeInTheDocument()
    expect(within(table).getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /admit student/i })).not.toBeInTheDocument() // registrars lack student:admit
  })

  it('shows student counts per department and drills down to programme and level, filtering on the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Students />)
    const cs = await screen.findByRole('button', { name: /CS.*Computer Science/ })
    expect(cs).toHaveTextContent('3')
    await user.click(cs)
    await waitFor(() => expect(lastStudentsParams()).toMatchObject({ departmentId: '1' }))

    await user.click(screen.getByRole('button', { name: /BSC-CS/ }))
    await waitFor(() => expect(lastStudentsParams()).toMatchObject({ departmentId: '1', programId: '1' }))
    await user.click(screen.getByRole('button', { name: /Level 200/ }))
    await waitFor(() => expect(lastStudentsParams()).toMatchObject({ programId: '1', level: '200' }))
  })

  it('filters by registration status for the selected term', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Students />)
    await screen.findByText('STU2025001')
    await user.selectOptions(screen.getByLabelText('Registration status'), 'none')
    await waitFor(() => expect(lastStudentsParams()).toMatchObject({ registrationStatus: 'none', semesterId: '2' }))
  })
})
