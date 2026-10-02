import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { authApi } from '../../api/auth'
import AvatarUploader from './AvatarUploader'

const auth = vi.hoisted(() => ({ user: null, setProfile: vi.fn() }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth }))
// jsdom has no canvas, so cropping is faked; the file-type and size checks stay real.
vi.mock('../../lib/image', async (importOriginal) => ({
  ...(await importOriginal()),
  fileToAvatarImages: vi.fn().mockResolvedValue({ image: 'data:image/jpeg;base64,FULL', thumb: 'data:image/jpeg;base64,THUMB' }),
}))

const person = { firstName: 'Ama', lastName: 'Mensah' }
const pick = (file) => fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } })
const png = () => new File(['x'], 'me.png', { type: 'image/png' })

beforeEach(() => {
  vi.restoreAllMocks()
  auth.setProfile.mockReset()
})

describe('AvatarUploader', () => {
  it('refuses a file that is not a JPG, PNG or WebP, and says why', async () => {
    auth.user = { ...person, role: { name: 'LECTURER' } }
    renderWithProviders(<AvatarUploader />)
    pick(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPG, PNG or WebP/)
    expect(screen.queryByRole('button', { name: /save picture/i })).not.toBeInTheDocument()
  })

  it('previews the pick, then saves the picture and thumbnail and updates the signed-in user', async () => {
    auth.user = { ...person, role: { name: 'LECTURER' } }
    const profile = { ...auth.user, avatar: 'data:image/jpeg;base64,FULL' }
    vi.spyOn(authApi, 'setAvatar').mockResolvedValue(profile)
    const user = userEvent.setup()
    renderWithProviders(<AvatarUploader />)

    pick(png())
    await user.click(await screen.findByRole('button', { name: /save picture/i }))

    await waitFor(() => expect(auth.setProfile).toHaveBeenCalledWith(profile))
    expect(authApi.setAvatar).toHaveBeenCalledWith(
      { image: 'data:image/jpeg;base64,FULL', thumb: 'data:image/jpeg;base64,THUMB' }, expect.anything(),
    )
  })

  it('lets Cancel drop a preview without saving', async () => {
    auth.user = { ...person, role: { name: 'LECTURER' } }
    vi.spyOn(authApi, 'setAvatar')
    const user = userEvent.setup()
    renderWithProviders(<AvatarUploader />)
    pick(png())
    await user.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(authApi.setAvatar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /upload picture/i })).toBeInTheDocument()
  })

  it('offers Remove to staff but never to students, whose picture is required', () => {
    auth.user = { ...person, avatar: 'data:image/jpeg;base64,FULL', role: { name: 'REGISTRAR' } }
    const { unmount } = renderWithProviders(<AvatarUploader />)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    unmount()

    auth.user = { ...person, avatar: 'data:image/jpeg;base64,FULL', role: { name: 'STUDENT' } }
    renderWithProviders(<AvatarUploader required />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change picture/i })).toBeInTheDocument()
  })
})
