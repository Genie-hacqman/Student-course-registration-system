import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
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
    return plain([])
  })
})
const studentCalls = () => get.mock.calls.filter(([p]) => p === '/students')

describe('Students page', () => {
  it('shows the departments and a search box, but no student table until something is searched for', async () => {
    renderWithProviders(<Students />)
    expect(await screen.findByText('Students by department')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/name, student id or email/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(studentCalls()).toHaveLength(0)
    for (const label of ['Department', 'Programme', 'Level', 'Registration status']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
  })

  it('shows each department with its student count, as a link to that department\'s own page', async () => {
    renderWithProviders(<Students />)
    const cs = await screen.findByRole('link', { name: /CS.*Computer Science/ })
    expect(cs).toHaveTextContent('3')
    expect(cs).toHaveAttribute('href', '/staff/students/departments/1')
    expect(screen.getByRole('link', { name: /MATH.*Mathematics/ })).toHaveAttribute('href', '/staff/students/departments/2')
    expect(screen.queryByRole('list', { name: 'Programmes' })).not.toBeInTheDocument() // nothing expands inline
  })

  it('searches students by name, Student ID or email and lists the matches', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Students />)
    await user.type(await screen.findByPlaceholderText(/name, student id or email/i), 'Ama{Enter}')
    expect(await screen.findByText('STU2025001')).toBeInTheDocument()
    expect(studentCalls().at(-1)[1].params).toMatchObject({ search: 'Ama' })
    for (const header of ['Student ID', 'Programme', 'Department', 'Level', 'Admission', 'Registration']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    const table = screen.getByRole('table')
    expect(within(table).getByText('Staff admission')).toBeInTheDocument()
    expect(within(table).getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /admit student/i })).not.toBeInTheDocument() // registrars lack student:admit
  })
})
