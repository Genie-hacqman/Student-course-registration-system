import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { applicationsApi } from '../../api/applications'
import ApplicationPhoto from './ApplicationPhoto'

vi.mock('../../lib/image', async (importOriginal) => ({
  ...(await importOriginal()),
  fileToOfficialPhoto: vi.fn().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' })),
}))

const draft = { present: false, uploadedAt: null, lockedAt: null, locked: false }
const stored = { present: true, uploadedAt: '2026-10-02T10:00:00Z', lockedAt: null, locked: false }
const locked = { present: true, uploadedAt: '2026-10-02T10:00:00Z', lockedAt: '2026-10-02T11:00:00Z', locked: true }
const pick = (file) => fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } })
const png = () => new File(['x'], 'me.png', { type: 'image/png' })

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(applicationsApi, 'myPhoto').mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
})

describe('ApplicationPhoto while the application is a draft', () => {
  it('invites an upload when there is no photo yet, and says it is required and will lock', () => {
    renderWithProviders(<ApplicationPhoto photo={draft} />)
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.getByText(/required/i)).toBeInTheDocument()
    expect(screen.getByText(/after that it is locked/i)).toBeInTheDocument()
  })

  it('refuses a file that is not a JPG, PNG or WebP, and says why', async () => {
    renderWithProviders(<ApplicationPhoto photo={draft} />)
    pick(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPG, PNG or WebP/)
    expect(screen.queryByRole('button', { name: /save photo/i })).not.toBeInTheDocument()
  })

  it('previews the pick, then uploads it and reports the new photo state', async () => {
    const photo = { ...stored }
    vi.spyOn(applicationsApi, 'setPhoto').mockResolvedValue({ application: { photo } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ApplicationPhoto photo={draft} onChange={onChange} />)

    pick(png())
    expect(await screen.findByAltText('Preview of your photo')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save photo/i }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(photo))
    expect(applicationsApi.setPhoto).toHaveBeenCalledWith(expect.any(Blob), expect.anything())
  })

  it('lets Cancel drop a preview without uploading', async () => {
    vi.spyOn(applicationsApi, 'setPhoto')
    const user = userEvent.setup()
    renderWithProviders(<ApplicationPhoto photo={draft} />)
    pick(png())
    await user.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(applicationsApi.setPhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument()
  })

  it('offers Replace and Remove for a stored photo, and Remove tells the parent', async () => {
    vi.spyOn(applicationsApi, 'removePhoto').mockResolvedValue({ application: { photo: draft } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ApplicationPhoto photo={stored} onChange={onChange} />)

    expect(await screen.findByAltText('Your application photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replace photo/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(draft))
  })

  it('shows what the server says when it refuses a change (e.g. the application was submitted elsewhere)', async () => {
    vi.spyOn(applicationsApi, 'removePhoto').mockRejectedValue(new Error('The official application photo is locked once your application is submitted and can no longer be changed'))
    const user = userEvent.setup()
    renderWithProviders(<ApplicationPhoto photo={stored} />)
    await user.click(await screen.findByRole('button', { name: /remove/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/locked once your application is submitted/i)
  })
})

describe('ApplicationPhoto after submission', () => {
  it('is read-only: labelled official and locked, with no way to replace or remove it', async () => {
    renderWithProviders(<ApplicationPhoto photo={locked} />)
    expect(screen.getByText('Official Application Photo')).toBeInTheDocument()
    expect(screen.getByText('Locked after submission')).toBeInTheDocument()
    expect(await screen.findByAltText('Official application photo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replace|remove|upload/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('says so plainly when an older application has no photo on file', () => {
    renderWithProviders(<ApplicationPhoto photo={{ ...locked, present: false }} />)
    expect(screen.getByText(/no photograph was recorded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
