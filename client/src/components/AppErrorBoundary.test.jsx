import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppErrorBoundary from './AppErrorBoundary'

function Boom() {
  throw new Error('render crash')
}

afterEach(() => vi.restoreAllMocks())

describe('AppErrorBoundary', () => {
  it('shows a friendly page with Reload and Go home instead of a blank screen when a page crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AppErrorBoundary><Boom /></AppErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument()
  })

  it('renders the app normally when nothing goes wrong', () => {
    render(<AppErrorBoundary><p>All good</p></AppErrorBoundary>)
    expect(screen.getByText('All good')).toBeInTheDocument()
  })
})
