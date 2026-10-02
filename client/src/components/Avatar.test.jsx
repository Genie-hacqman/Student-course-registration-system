import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './ui'

const person = { firstName: 'Ama', lastName: 'Mensah' }

describe('Avatar', () => {
  it('falls back to initials when there is no picture', () => {
    render(<Avatar user={person} />)
    expect(screen.getByText('AM')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the full picture, with the person named in the alt text', () => {
    render(<Avatar user={{ ...person, avatar: 'data:image/jpeg;base64,FULL', avatarThumb: 'data:image/jpeg;base64,THUMB' }} />)
    const img = screen.getByRole('img', { name: "Ama Mensah's photo" })
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,FULL')
  })

  it('uses only the small thumbnail in lists, and initials if a row has none', () => {
    const { rerender } = render(<Avatar thumb user={{ ...person, avatar: 'FULL', avatarThumb: 'data:image/jpeg;base64,THUMB' }} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,THUMB')
    rerender(<Avatar thumb user={person} />)
    expect(screen.getByText('AM')).toBeInTheDocument()
  })
})
