import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { authApi } from '../../api/auth'
import ForgotPassword from './ForgotPassword'

// The page's own copy is the enumeration-safety guarantee made visible: it must never let the
// existence of an account be inferred from what's shown, so this locks that message in place.
const GENERIC_MESSAGE = 'If an account exists for that email, your request has been received. You will get an email with a reset link once it is approved by the administrator.'

describe('ForgotPassword', () => {
  it('shows the generic success message after submitting, regardless of what the account turns out to be', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: GENERIC_MESSAGE })
    const user = userEvent.setup()
    renderWithProviders(<ForgotPassword />)

    await user.type(screen.getByLabelText(/email/i), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /request password reset/i }))

    await waitFor(() => expect(screen.getByText(GENERIC_MESSAGE)).toBeInTheDocument())
    // React Query's mutationFn also receives a context object (client, meta, mutationKey) as a 2nd arg.
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'someone@example.com' }, expect.anything())
  })

  it('links students to the PIN-reset flow instead of the password form', () => {
    renderWithProviders(<ForgotPassword />)
    expect(screen.getByRole('link', { name: /reset your pin instead/i })).toHaveAttribute('href', '/forgot-pin')
  })
})
