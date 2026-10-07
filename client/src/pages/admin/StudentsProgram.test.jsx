import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { REGISTRAR, page, plain, student, summary } from '../../test/directoryFixtures'
import StudentsProgram from './StudentsProgram'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

let get
beforeEach(() => {
  vi.restoreAllMocks()
  auth.user = REGISTRAR
  get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/students/summary') return plain(summary)
    if (path === '/programs/1/students') return page([student])
    return plain([])
  })
})
const studentParams = () => get.mock.calls.filter(([p]) => p === '/programs/1/students').at(-1)?.[1]?.params

const renderPage = (id = 1) => renderWithProviders(
  <Routes><Route path="/staff/students/programs/:programId" element={<StudentsProgram />} /></Routes>,
  { route: `/staff/students/programs/${id}` },
)

describe('Students by department: one programme', () => {
  it('shows the programme\'s students with level tabs and counts, and a way back to the department', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'BSc Computer Science' })).toBeInTheDocument()
    expect(await screen.findByText('STU2025001')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /All levels/ })).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /Level 100/ })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /Level 200/ })).toHaveTextContent('2')
    expect(screen.getByRole('link', { name: 'Computer Science' })).toHaveAttribute('href', '/staff/students/departments/1')
    expect(screen.queryByRole('columnheader', { name: 'Programme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Department' })).not.toBeInTheDocument()
  })

  it('filters by level on the server', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: /Level 200/ }))
    await waitFor(() => expect(studentParams()).toMatchObject({ level: '200' }))
  })

  it('searches within the programme', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByPlaceholderText(/name, student id or email/i), 'Ama{Enter}')
    await waitFor(() => expect(studentParams()).toMatchObject({ search: 'Ama' }))
  })

  it('says so when the programme does not exist', async () => {
    renderPage(99)
    expect(await screen.findByText('Programme not found')).toBeInTheDocument()
  })
})
