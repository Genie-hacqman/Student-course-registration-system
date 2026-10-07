import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import { plain } from '../../test/directoryFixtures'
import { SemesterForm } from './Semesters'

const local = (value) => new Date(value).toISOString() // the form works in the browser's local time

const semester = {
  id: 5, academicYearId: 1, name: 'First Semester', term: 1, startDate: '2027-06-01', endDate: '2027-09-30',
  registrationStart: local('2027-05-01T09:00'), registrationEnd: local('2027-05-20T17:00'), addDropEnd: local('2027-06-10T17:00'),
  minCredits: 12, maxCredits: 24, status: 'upcoming',
}

let patch
let onClose
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'get').mockImplementation(async () => plain([{ id: 1, name: '2026/2027', semesters: [] }]))
  patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: semester } })
  onClose = vi.fn()
})

const open = async () => {
  renderWithProviders(<SemesterForm editing={semester} onClose={onClose} />)
  await screen.findByRole('option', { name: '2026/2027' })
}
const setBox = async (user, name, value) => {
  const box = screen.getByLabelText(name)
  await user.clear(box)
  if (value) await user.type(box, value)
}
const save = (user) => user.click(screen.getByRole('button', { name: 'Save' }))

describe('Semester form: registration period', () => {
  it('has a separate date box and time box for each of opens, closes and add/drop ends, pre-filled when editing', async () => {
    await open()
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    const expected = {
      Opens: ['2027-05-01', '09:00'],
      Closes: ['2027-05-20', '17:00'],
      'Add/drop ends (optional)': ['2027-06-10', '17:00'],
    }
    for (const [label, [date, time]] of Object.entries(expected)) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument()
      expect(screen.getByLabelText(`${label} date`)).toHaveValue(date)
      expect(screen.getByLabelText(`${label} time`)).toHaveValue(time)
    }
  })

  it('saves a changed time as the same moment the API uses, leaving the other fields as they were', async () => {
    const user = userEvent.setup()
    await open()
    await setBox(user, 'Closes time', '1830')
    await save(user)
    await waitFor(() => expect(patch).toHaveBeenCalled())
    const [path, body] = patch.mock.calls[0]
    expect(path).toBe('/semesters/5')
    expect(body.registrationEnd).toBe(local('2027-05-20T18:30'))
    expect(body.registrationStart).toBe(semester.registrationStart)
    expect(body.addDropEnd).toBe(semester.addDropEnd)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('asks for the time when only the date is filled, and does not save', async () => {
    const user = userEvent.setup()
    await open()
    await setBox(user, 'Opens time', '')
    await save(user)
    expect(await screen.findByText('Choose a time')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('compares date and time together: closing the same day before opening is refused', async () => {
    const user = userEvent.setup()
    await open()
    await setBox(user, 'Closes date', '2027-05-01')
    await setBox(user, 'Closes time', '0800')
    await save(user)
    expect(await screen.findByText('Must be after registration opens')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    await setBox(user, 'Closes time', '1000') // same day, later time: fine
    await save(user)
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1].registrationEnd).toBe(local('2027-05-01T10:00'))
  })

  it('lets add/drop ends be left empty', async () => {
    const user = userEvent.setup()
    await open()
    await setBox(user, 'Add/drop ends (optional) date', '')
    await setBox(user, 'Add/drop ends (optional) time', '')
    await save(user)
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1].addDropEnd).toBeUndefined()
  })
})
