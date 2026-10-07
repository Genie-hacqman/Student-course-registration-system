import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/render'
import { api } from '../../api/client'
import AuditLog from './AuditLog'

const ENTRY = {
  id: 1, action: 'course.update', actionLabel: 'Course changed', entityType: 'Course', entityId: 7,
  createdAt: '2026-10-06T10:00:00.000Z', ipAddress: '10.0.0.1', userAgent: 'Firefox', requestId: 'req-1',
  actorEmail: 'registrar@scrs.local', actorRole: 'REGISTRAR', user: null,
  metadata: { code: 'CS201', changes: { title: { from: 'Old title', to: 'New title' }, description: { changed: true } } },
}

const OPTIONS = {
  entityTypes: ['Course', 'Lecturer'],
  actions: [
    { action: 'course.update', label: 'Course changed', group: 'Courses and timetable' },
    { action: 'auth.login', label: 'Signed in', group: 'Sign-in and accounts' },
  ],
}

const mockApi = (items = [ENTRY]) => vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(
  path === '/admin/audit-logs/options'
    ? { data: { success: true, data: OPTIONS } }
    : { data: { success: true, data: items, meta: { page: 1, limit: 50, total: items.length, totalPages: 1 } } },
))

describe('AuditLog', () => {
  it('shows the catalogue label with the raw action under it, and the actor snapshot when the account is gone', async () => {
    mockApi()
    renderWithProviders(<AuditLog />)

    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('Course changed')).toBeInTheDocument()
    expect(table.getByText('course.update')).toBeInTheDocument()
    expect(table.getByText('registrar@scrs.local')).toBeInTheDocument()
  })

  it('opens the details to readable before/after lines, with "changed" for text the server keeps out of the log', async () => {
    mockApi()
    renderWithProviders(<AuditLog />)

    await userEvent.click(await screen.findByRole('button', { name: /details/i }))
    expect(screen.getByText('title: Old title → New title')).toBeInTheDocument()
    expect(screen.getByText('description changed')).toBeInTheDocument()
  })

  it('offers the actions that exist in the log, grouped, and the record types the server reports', async () => {
    mockApi()
    renderWithProviders(<AuditLog />)

    const action = await screen.findByRole('combobox', { name: 'Action' })
    await screen.findByRole('option', { name: 'Course changed' })
    expect(within(action).getByRole('option', { name: 'Signed in' })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Record type' })).getByRole('option', { name: 'Lecturer' })).toBeInTheDocument()
  })

  it('keeps an action from a link selectable even when the log has no rows for it yet', async () => {
    mockApi([])
    renderWithProviders(<AuditLog />, { route: '/?action=security.access_denied' })

    expect(await screen.findByRole('option', { name: 'security.access_denied' })).toBeInTheDocument()
  })
})
