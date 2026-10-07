import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { REGISTRAR, plain, summary } from '../../test/directoryFixtures'
import StudentsDepartment from './StudentsDepartment'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

beforeEach(() => {
  vi.restoreAllMocks()
  auth.user = REGISTRAR
  vi.spyOn(api, 'get').mockImplementation(async (path) => (path === '/students/summary' ? plain(summary) : plain([])))
})

const renderPage = (id) => renderWithProviders(
  <Routes><Route path="/staff/students/departments/:departmentId" element={<StudentsDepartment />} /></Routes>,
  { route: `/staff/students/departments/${id}` },
)

describe('Students by department: one department', () => {
  it('lists the department\'s programmes with counts, each linking to the programme\'s students', async () => {
    renderPage(1)
    expect(await screen.findByRole('heading', { name: 'Computer Science' })).toBeInTheDocument()
    expect(screen.getByText('3 students · 1 programme')).toBeInTheDocument()
    const programmes = screen.getByRole('list', { name: 'Programmes' })
    const row = within(programmes).getByRole('link', { name: /BSC-CS/ })
    expect(row).toHaveAttribute('href', '/staff/students/programs/1')
    expect(row).toHaveTextContent('BSc Computer Science')
    expect(row).toHaveTextContent('3 students')
    expect(row).toHaveTextContent('L100: 1 · L200: 2')
    expect(screen.queryByRole('table')).not.toBeInTheDocument() // no students on this page
  })

  it('links back to the Students page', async () => {
    renderPage(1)
    expect(await screen.findByRole('link', { name: 'Students' })).toHaveAttribute('href', '/staff/students')
  })

  it('links to the department\'s management page for someone with directory:view', async () => {
    renderPage(1)
    expect(await screen.findByRole('link', { name: /open department page/i })).toHaveAttribute('href', '/staff/departments/1')
  })

  it('hides the department page link without directory:view', async () => {
    auth.user = { ...REGISTRAR, permissions: REGISTRAR.permissions.filter((p) => p !== 'directory:view') }
    renderPage(1)
    await screen.findByRole('heading', { name: 'Computer Science' })
    expect(screen.queryByRole('link', { name: /open department page/i })).not.toBeInTheDocument()
  })

  it('says so when the department has no programmes', async () => {
    renderPage(2)
    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeInTheDocument()
    expect(screen.getByText('No programmes yet')).toBeInTheDocument()
  })

  it('says so when the department does not exist', async () => {
    renderPage(99)
    expect(await screen.findByText('Department not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('href', '/staff/students')
  })
})
