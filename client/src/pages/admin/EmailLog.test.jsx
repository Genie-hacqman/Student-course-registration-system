import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import EmailLog from './EmailLog'

const row = (overrides) => ({
  id: 1, template: 'passwordResetRequest', recipient: 'a***@example.com', subject: 'Reset your password',
  provider: 'resend', status: 'sent', error: null, attempts: 1, createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
})

const mockDeliveries = (items) => vi.spyOn(api, 'get').mockResolvedValue({
  data: { success: true, data: items, meta: { page: 1, limit: 25, total: items.length, totalPages: 1 } },
})

const tableBody = async () => within(await screen.findByRole('table'))

describe('EmailLog', () => {
  it('shows "Accepted" for a sent row and "Delivered" for a delivered one, never the raw status', async () => {
    mockDeliveries([row({ id: 1, status: 'sent' }), row({ id: 2, status: 'delivered', recipient: 'b***@example.com' })])
    renderWithProviders(<EmailLog />)

    const table = await tableBody()
    expect(await table.findByText('Accepted')).toBeInTheDocument()
    expect(table.getByText('Delivered')).toBeInTheDocument()
    expect(table.queryByText('sent')).not.toBeInTheDocument()
    expect(table.queryByText('delivered')).not.toBeInTheDocument()
  })

  it('shows the error text under a failed row', async () => {
    mockDeliveries([row({ status: 'failed', error: 'Resend rejected the request' })])
    renderWithProviders(<EmailLog />)

    const table = await tableBody()
    expect(await table.findByText('Failed')).toBeInTheDocument()
    expect(table.getByText('Resend rejected the request')).toBeInTheDocument()
  })

  it('never renders a message body, even if a row happened to carry one', async () => {
    mockDeliveries([row({ html: '<p>secret reset link</p>', text: 'secret reset link' })])
    renderWithProviders(<EmailLog />)

    const table = await tableBody()
    await table.findByText('Accepted')
    expect(screen.queryByText(/secret reset link/i)).not.toBeInTheDocument()
  })
})
