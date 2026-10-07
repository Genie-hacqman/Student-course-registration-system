import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { metaFor } from '../lib/pageMeta'

function headTag(name) {
  let tag = document.head.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  return tag
}

export default function RouteMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const { title, description, noindex } = metaFor(pathname)
    document.title = title
    headTag('description').setAttribute('content', description)
    const robots = headTag('robots')
    if (noindex) robots.setAttribute('content', 'noindex, nofollow')
    else robots.setAttribute('content', 'index, follow')
  }, [pathname])
  return null
}
