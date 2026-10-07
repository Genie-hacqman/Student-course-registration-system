import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'
import ResetPassword from './ResetPassword'

const fillAndSubmit = async (user, password = 'NewPassw0rd1', confirm = password) => {
  await user.type(screen.getByLabelText(/^new password$/i), password)
  await user.type(screen.getByLabelText(/confirm password/i), confirm)
  await user.click(screen.getByRole('button', { name: /reset password/i }))
}

describe('ResetPassword', () => {
  it('shows an error state when the link has no token at all', () => {
    renderWithProviders(<ResetPassword />, { route: '/reset-password' })
    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('succeeds with a valid token and shows confirmation', async () => {
    vi.spyOn(authApi, 'resetPassword').mockResolvedValue({ message: 'Password has been reset. Please log in.' })
    const user = userEvent.setup()
    renderWithProviders(<ResetPassword />, { route: '/reset-password?token=a-valid-looking-token-1234567890' })

    await fillAndSubmit(user)

    await waitFor(() => expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'a-valid-looking-token-1234567890',
      password: 'NewPassw0rd1',
    }, expect.anything()))
  })

  it('offers a fresh link instead of a generic error when the token is expired or already used', async () => {
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(
      new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'Reset token is invalid or has expired' }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ResetPassword />, { route: '/reset-password?token=an-expired-token-1234567890' })

    await fillAndSubmit(user)

    expect(await screen.findByText(/this link can't be used/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows the password rule error inline instead of the link-problem state for any other failure', async () => {
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(
      new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'password', message: 'Password must contain a number' }] }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ResetPassword />, { route: '/reset-password?token=a-valid-looking-token-1234567890' })

    await fillAndSubmit(user, 'NoNumbersHere', 'NoNumbersHere')

    expect(await screen.findByText(/password must contain a number/i)).toBeInTheDocument()
    expect(screen.queryByText(/this link can't be used/i)).not.toBeInTheDocument()
  })
})
