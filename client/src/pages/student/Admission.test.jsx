import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { applicationsApi } from '../../api/applications'
import Admission from './Admission'

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

describe('Admission: the passport photo is mandatory', () => {
  it('blocks submitting until a photo is added, while still allowing a draft to be saved', async () => {
    auth.set(applicant)
    renderWithProviders(<Admission />)

    expect(await screen.findByText('Passport photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit application/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled()
    expect(screen.getByText(/add your passport photo above before submitting/i)).toBeInTheDocument()
  })

  it('lets the applicant submit once they have a photo', async () => {
    auth.set({ ...applicant, avatar: 'data:image/jpeg;base64,FULL' })
    renderWithProviders(<Admission />)

    expect(await screen.findByRole('button', { name: /submit application/i })).toBeEnabled()
    expect(screen.queryByText(/add your passport photo above/i)).not.toBeInTheDocument()
  })

  it('keeps what the applicant has typed when their photo is saved (the signed-in user object changes)', async () => {
    auth.set(applicant)
    const user = userEvent.setup()
    renderWithProviders(<Admission />)

    await user.type(await screen.findByLabelText(/phone number/i), '+233 24 123 4567')
    act(() => auth.set({ ...applicant, avatar: 'data:image/jpeg;base64,FULL' })) // what the uploader does via setProfile

    expect(screen.getByLabelText(/phone number/i)).toHaveValue('+233 24 123 4567')
    expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled()
  })

  it('still holds submit back for an unconfirmed email even with a photo', async () => {
    auth.set({ ...applicant, avatar: 'data:image/jpeg;base64,FULL' })
    applicationsApi.mine.mockResolvedValue({ application: null, emailVerified: false })
    renderWithProviders(<Admission />)

    expect(await screen.findByRole('button', { name: /submit application/i })).toBeDisabled()
  })
})
