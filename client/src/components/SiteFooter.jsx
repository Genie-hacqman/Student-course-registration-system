import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { SITE, hasContact, telHref } from '../lib/site'

export function ContactDetails({ className = '', linkClassName = 'underline underline-offset-2 hover:text-white' }) {
  if (!hasContact) return null
  return (
    <ul className={`space-y-1 ${className}`}>
      {SITE.email && (
        <li className="flex items-center gap-2">
          <Mail className="size-4 shrink-0" aria-hidden />
          <a href={`mailto:${SITE.email}`} className={linkClassName}>{SITE.email}</a>
        </li>
      )}
      {SITE.phone && (
        <li className="flex items-center gap-2">
          <Phone className="size-4 shrink-0" aria-hidden />
          <a href={telHref(SITE.phone)} className={linkClassName}>{SITE.phone}</a>
        </li>
      )}
      {SITE.address && (
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{SITE.address}</span>
        </li>
      )}
    </ul>
  )
}

export default function SiteFooter({ className = '' }) {
  return (
    <footer className={`text-xs text-white/80 ${className}`}>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link to="/privacy" className="underline underline-offset-2 hover:text-white">Privacy policy</Link>
        <Link to="/terms" className="underline underline-offset-2 hover:text-white">Terms and conditions</Link>
      </nav>
      {hasContact && (
        <div className="mt-3 flex justify-center">
          <ContactDetails />
        </div>
      )}
    </footer>
  )
}
