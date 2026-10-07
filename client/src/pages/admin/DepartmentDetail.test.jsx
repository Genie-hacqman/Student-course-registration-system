import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api/client'
import { MotionProvider } from '../../lib/motionPresets'
import { REGISTRAR, page, plain, student } from '../../test/directoryFixtures'
import DepartmentDetail from './DepartmentDetail'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

const overview = {
  id: 1, code: 'CS', name: 'Computer Science', status: 'active',
  counts: { programs: 1, activePrograms: 1, students: 3, activeStudents: 3, lecturers: 1, courses: 7 },
  programs: [{ id: 1, code: 'BSC-CS', name: 'BSc Computer Science', status: 'active', qualificationCode: 'BSC', durationYears: 4, students: 3, levels: [{ level: 200, students: 3 }] }],
}
const lecturer = { id: 1, staffNumber: 'STF1001', title: 'Dr.', membership: 'home', currentSections: 4, user: { firstName: 'Kofi', lastName: 'Owusu', email: 'lecturer@scrs.local', status: 'active' } }

let get
beforeEach(() => {
  vi.restoreAllMocks()
  auth.user = REGISTRAR
  get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/departments/1/overview') return plain(overview)
    if (path === '/departments/1/students') return page([student])
    if (path === '/departments/1/lecturers') return page([lecturer])
    if (path === '/courses') return page([{ id: 3, code: 'CS201', title: 'Data Structures', level: 200, credits: 3, status: 'active' }])
    return plain([])
  })
})

const renderPage = () => render(
  <MotionProvider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/staff/departments/1']}>
        <Routes><Route path="/staff/departments/:id" element={<DepartmentDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </MotionProvider>,
)

describe('DepartmentDetail', () => {
  it('shows the counts and the department students first', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Computer Science' })).toBeInTheDocument()
    expect(screen.getByText('Home and additional')).toBeInTheDocument()
    expect(screen.getByText('3 active')).toBeInTheDocument()
    expect(await screen.findByText('STU2025001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument()
  })

  it('switches between Students, Lecturers, Programmes and Courses', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('STU2025001')
    await user.click(screen.getByRole('tab', { name: 'Lecturers' }))
    expect(await screen.findByText('STF1001')).toBeInTheDocument()
    expect(screen.getByText('Home department')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Programmes' }))
    expect(await screen.findByText('L200: 3')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Courses' }))
    expect(await screen.findByText('CS201')).toBeInTheDocument()
    await waitFor(() => expect(get.mock.calls.some(([p, c]) => p === '/courses' && c?.params?.departmentId === '1')).toBe(true))
  })
})
