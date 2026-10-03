import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api/client'
import StudentDetail from './StudentDetail'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))

const admin = { firstName: 'Sys', lastName: 'Admin', role: { name: 'ADMIN' }, permissions: ['registration:view_all', 'application:review', 'user:manage'] }
const registrar = { firstName: 'Esi', lastName: 'Boateng', role: { name: 'REGISTRAR' }, permissions: ['registration:view_all'] }

const student = {
  id: 7, userId: 30, studentNumber: 'STU2026001', level: 100, status: 'active', admissionNumber: 'APP000012',
  user: { firstName: 'Ada', lastName: 'Applicant', email: 'stu2026001@students.scrs.edu', avatar: null },
  program: { name: 'BSc Computer Science' },
}
const application = {
  id: 12, applicationNumber: 'APP000012', status: 'admitted', firstName: 'Ada', otherNames: 'Kafui', lastName: 'Applicant',
  dateOfBirth: '2005-04-12', phone: '+233 24 123 4567', personalEmail: 'ada@personal.test', entryLevel: 100,
  admissionSession: '2026/2027', submittedAt: '2026-10-02T10:00:00Z', reviewedAt: '2026-10-02T12:00:00Z',
  department: { name: 'Computer Science' }, program: { name: 'BSc Computer Science' }, reviewer: { firstName: 'Sys', lastName: 'Admin' },
  photo: { present: true, uploadedAt: '2026-10-02T09:00:00Z', lockedAt: '2026-10-02T10:00:00Z', locked: true },
}

/** Routes every GET the page makes; `applicationResult` is the student's application, or an error. */
const serve = ({ applicationResult = application, photoFails = false } = {}) =>
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/students/7') return { data: { data: student } }
    if (path === '/students/7/application') {
      if (applicationResult instanceof Error) throw applicationResult
      return { data: { data: applicationResult } }
    }
    if (path === '/students/7/application/photo') {
      if (photoFails) throw Object.assign(new Error('The photo could not be loaded'), { status: 503, code: 'PHOTO_UNAVAILABLE' })
      return { data: new Blob(['jpeg'], { type: 'image/jpeg' }) }
    }
    return { data: { data: [] } } // waivers, current semester, results
  })

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/staff/students/7']}>
      <Routes><Route path="/staff/students/:id" element={<StudentDetail />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
)

beforeEach(() => vi.restoreAllMocks())

describe('StudentDetail: the photo they applied with, and their application', () => {
  it('shows the official application photo, labelled, separate from the profile picture', async () => {
    auth.user = registrar
    serve()
    renderPage()

    expect(await screen.findByAltText('Official application photo')).toBeInTheDocument()
    expect(screen.getByText('Official Application Photo')).toBeInTheDocument()
    expect(screen.getByText('Profile picture')).toBeInTheDocument()
    expect(screen.getAllByText('APP000012').length).toBeGreaterThan(0)
  })

  it('shows everything the student submitted, read-only', async () => {
    auth.user = registrar
    serve()
    renderPage()

    expect(await screen.findByText('Admission application')).toBeInTheDocument()
    for (const text of ['Ada Kafui Applicant', '+233 24 123 4567', 'ada@personal.test', 'Computer Science', 'Level 100', '2026/2027', 'Admitted']) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0)
    }
    expect(screen.getByText(/by Sys Admin/)).toBeInTheDocument()
  })

  it('links admins to the full application, but not registrars (that page is admin-only)', async () => {
    auth.user = admin
    serve()
    const { unmount } = renderPage()
    expect(await screen.findByRole('link', { name: 'View full application' })).toHaveAttribute('href', '/staff/applications/12')
    unmount()

    auth.user = registrar
    serve()
    renderPage()
    await screen.findByText('Admission application')
    expect(screen.queryByRole('link', { name: 'View full application' })).not.toBeInTheDocument()
  })

  it('says so when a student was admitted by staff and has no online application', async () => {
    auth.user = admin
    serve({ applicationResult: Object.assign(new Error('This student has no online application'), { status: 404, code: 'NO_APPLICATION' }) })
    renderPage()

    expect(await screen.findByText(/admitted by staff, so there is no online application/i)).toBeInTheDocument()
    expect(screen.getByText('Profile picture')).toBeInTheDocument()
    expect(screen.queryByText('Official Application Photo')).not.toBeInTheDocument()
  })

  it('says "couldn\'t be loaded" with Retry when storage fails, instead of looking like there is no photo', async () => {
    auth.user = admin
    serve({ photoFails: true })
    renderPage()

    expect(await screen.findByText("Photo couldn't be loaded")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText('No photo on file')).not.toBeInTheDocument()
  })
})
