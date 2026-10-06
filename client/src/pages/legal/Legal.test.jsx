import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import NotFound from '../NotFound'
import Privacy from './Privacy'
import Terms from './Terms'

describe('public pages', () => {
  it('Privacy says what cookie is set, and links to the terms', () => {
    renderWithProviders(<Privacy />)
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument()
    expect(screen.getByText(/one cookie/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /terms and conditions/i })[0]).toHaveAttribute('href', '/terms')
  })

  it('Terms links back to the privacy policy', () => {
    renderWithProviders(<Terms />)
    expect(screen.getByRole('heading', { level: 1, name: /terms and conditions/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /privacy policy/i }).every((l) => l.getAttribute('href') === '/privacy')).toBe(true)
  })

  it('the 404 page offers a way back to sign in or to apply', () => {
    renderWithProviders(<NotFound />)
    expect(screen.getByRole('heading', { name: /can't find that page/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to unireg/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /apply for admission/i })).toHaveAttribute('href', '/apply')
  })
})
