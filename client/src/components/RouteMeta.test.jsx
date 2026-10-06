import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RouteMeta from './RouteMeta'

const at = (path) => render(<MemoryRouter initialEntries={[path]}><RouteMeta /></MemoryRouter>)
const meta = (name) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content')

afterEach(() => { document.title = ''; document.head.querySelectorAll('meta[name]').forEach((m) => m.remove()) })

describe('RouteMeta', () => {
  it('sets the title and description for a public page and lets it be indexed', () => {
    at('/apply')
    expect(document.title).toBe('Apply for admission · UniReg')
    expect(meta('description')).toMatch(/apply for admission online/i)
    expect(meta('robots')).toBe('index, follow')
  })

  it('keeps private and token pages out of search', () => {
    at('/staff/audit-log')
    expect(document.title).toBe('Audit log · Staff portal · UniReg')
    expect(meta('robots')).toBe('noindex, nofollow')
  })

  it('marks an unknown address as not found and noindex', () => {
    at('/nowhere')
    expect(document.title).toMatch(/^Page not found/)
    expect(meta('robots')).toBe('noindex, nofollow')
  })
})
