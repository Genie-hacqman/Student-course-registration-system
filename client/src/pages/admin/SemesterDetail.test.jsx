import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { plain } from '../../test/directoryFixtures'
import SemesterDetail from './SemesterDetail'

const local = (value) => new Date(value).toISOString()

const semester = {
  id: 5, academicYearId: 1, name: 'First Semester', term: 1, startDate: '2027-06-01', endDate: '2027-09-30', isCurrent: false,
  registrationStart: local('2027-05-01T09:00'), registrationEnd: local('2027-05-20T17:00'), addDropEnd: null,
  minCredits: 12, maxCredits: 24, status: 'upcoming', academicYear: { id: 1, name: '2026/2027' },
}

let post
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'get').mockImplementation(async (path) => plain(path === '/semesters/5' ? semester : []))
  post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: {} } })
})

const renderPage = () => renderWithProviders(
  <Routes><Route path="/staff/semesters/:id" element={<SemesterDetail />} /></Routes>,
  { route: '/staff/semesters/5' },
)

describe('Semester page: registration windows', () => {
  it('adds a window using a separate date box and time box, and sends the combined moment', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /add window/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('input[type="datetime-local"]')).toBeNull()

    await user.type(within(dialog).getByLabelText('Name'), 'Final-year students')
    await user.type(within(dialog).getByLabelText('Opens at (your local time) date'), '2027-05-03')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Choose a time')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Opens at (your local time) time'), '0800')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    const [path, body] = post.mock.calls[0]
    expect(path).toBe('/semesters/5/priority-windows')
    expect(body.opensAt).toBe(local('2027-05-03T08:00'))
  })
})
