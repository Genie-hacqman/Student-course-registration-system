import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { applicationsApi } from '../../api/applications'
import Admission from './Admission'

// jsdom has no canvas, so cropping is faked.
vi.mock('../../lib/image', async (importOriginal) => ({
  ...(await importOriginal()),
  fileToOfficialPhoto: vi.fn().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' })),
}))

// A tiny external store, so a test can swap the signed-in user mid-render the way AuthProvider's setUser does.
const auth = vi.hoisted(() => {
  const listeners = new Set()
  const store = {
    user: null,
    set(user) { store.user = user; listeners.forEach((l) => l()) },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
    get: () => store.user,
  }
  return store
})
vi.mock('../../auth/AuthProvider', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useAuth: () => ({ user: useSyncExternalStore(auth.subscribe, auth.get), setProfile: auth.set }) }
})

const applicant = {
  firstName: 'Ada', lastName: 'Applicant', email: 'ada@personal.test', role: { name: 'STUDENT' }, admissionStatus: 'NOT_SUBMITTED',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(applicationsApi, 'mine').mockResolvedValue({ application: null, emailVerified: true })
  vi.spyOn(applicationsApi, 'options').mockResolvedValue([])
})

const noPhoto = { present: false, uploadedAt: null, lockedAt: null, locked: false }
const withPhoto = { present: true, uploadedAt: '2026-10-02T10:00:00Z', lockedAt: null, locked: false }
const draftWith = (photo, extra = {}) => ({
  application: { id: 1, status: 'draft', firstName: 'Ada', lastName: 'Applicant', photo, ...extra }, emailVerified: true,
})
const pick = (file) => fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } })

describe('Admission: the official application photo is mandatory', () => {
  beforeEach(() => {
    vi.spyOn(applicationsApi, 'myPhoto').mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  })

  it('blocks submitting until a photo is added, while still allowing a draft to be saved', async () => {
    auth.set(applicant)
    renderWithProviders(<Admission />)

    expect(await screen.findByText('Applicant Photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit application/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled()
    expect(screen.getByText(/add your applicant photo above before submitting/i)).toBeInTheDocument()
  })

  it('a profile picture does not count: only the official application photo does', async () => {
    auth.set({ ...applicant, avatar: 'data:image/jpeg;base64,FULL' })
    renderWithProviders(<Admission />)

    expect(await screen.findByRole('button', { name: /submit application/i })).toBeDisabled()
  })

  it('lets the applicant submit once the application has its photo', async () => {
    auth.set(applicant)
    applicationsApi.mine.mockResolvedValue(draftWith(withPhoto))
    renderWithProviders(<Admission />)

    expect(await screen.findByRole('button', { name: /submit application/i })).toBeEnabled()
    expect(screen.queryByText(/add your applicant photo above/i)).not.toBeInTheDocument()
  })

  it('uploading the photo enables submit and keeps everything the applicant has typed', async () => {
    auth.set(applicant)
    vi.spyOn(applicationsApi, 'setPhoto').mockResolvedValue({ application: { photo: withPhoto } })
    const user = userEvent.setup()
    renderWithProviders(<Admission />)

    await user.type(await screen.findByLabelText(/phone number/i), '+233 24 123 4567')
    pick(new File(['x'], 'me.png', { type: 'image/png' }))
    await user.click(await screen.findByRole('button', { name: /save photo/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled())
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('+233 24 123 4567')
  })

  it('keeps what the applicant has typed when the signed-in user object changes (e.g. a profile picture is saved)', async () => {
    auth.set(applicant)
    const user = userEvent.setup()
    renderWithProviders(<Admission />)

    await user.type(await screen.findByLabelText(/phone number/i), '+233 24 123 4567')
    act(() => auth.set({ ...applicant, avatar: 'data:image/jpeg;base64,FULL' })) // what the profile uploader does via setProfile

    expect(screen.getByLabelText(/phone number/i)).toHaveValue('+233 24 123 4567')
  })

  it('still holds submit back for an unconfirmed email even with a photo', async () => {
    auth.set(applicant)
    applicationsApi.mine.mockResolvedValue({ ...draftWith(withPhoto), emailVerified: false })
    renderWithProviders(<Admission />)

    expect(await screen.findByRole('button', { name: /submit application/i })).toBeDisabled()
  })

  it('after submitting, the photo is shown read-only and locked, with no controls', async () => {
    auth.set({ ...applicant, admissionStatus: 'PENDING' })
    applicationsApi.mine.mockResolvedValue(draftWith(
      { present: true, uploadedAt: '2026-10-02T10:00:00Z', lockedAt: '2026-10-02T11:00:00Z', locked: true },
      { status: 'submitted', submittedAt: '2026-10-02T11:00:00Z' },
    ))
    renderWithProviders(<Admission />)

    expect(await screen.findByText('Locked after submission')).toBeInTheDocument()
    expect(screen.getByText('Official Application Photo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replace|remove|upload/i })).not.toBeInTheDocument()
  })
})
