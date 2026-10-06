import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { metaFor } from '../lib/pageMeta'

/** Finds the head tag, or adds it, so the same code works whether index.html ships it or not. */
function headTag(name) {
  let tag = document.head.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  return tag
}

/**
 * Keeps the tab title, meta description and robots tag in step with the current route (rules in lib/pageMeta.js).
 * Renders nothing. Search and share previews that don't run JavaScript read the static tags in index.html instead.
 */
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
