import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import BrandMark from './BrandMark'

describe('BrandMark', () => {
  it('shows the logo as a decorative image on a white tile, sized by the caller', () => {
    const { container } = render(<BrandMark className="size-9 rounded-xl" />)
    const tile = container.firstChild
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img.getAttribute('src')).toMatch(/unireg-mark/)
    expect(tile).toHaveClass('bg-white', 'size-9', 'rounded-xl', 'overflow-hidden')
    expect(tile.className).not.toMatch(/bg-brand/)
  })
})
