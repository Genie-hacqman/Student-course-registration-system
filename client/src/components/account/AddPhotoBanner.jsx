import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Camera, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { ROLES } from '../../lib/roles'

const PHOTO_DISMISSED = 'unireg.photo-prompt.dismissed'

/** A gentle, dismissible nudge for anyone without a picture (the rule itself is enforced on application submit). */
export default function AddPhotoBanner({ path }) {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(PHOTO_DISMISSED) === '1' } catch { return false }
  })
  const location = useLocation()
  // Applicants are asked for it on the application form itself; never nag on the page that has the uploader.
  if (!user || user.avatar || dismissed || user.mustChangePassword) return null
  if (user.role?.name === ROLES.STUDENT && !user.student) return null
  if (location.pathname === path) return null
  const dismiss = () => {
    try { sessionStorage.setItem(PHOTO_DISMISSED, '1') } catch { /* not remembered */ }
    setDismissed(true)
  }
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-900 sm:px-6">
      <Camera className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Add a profile picture so people can recognise you.</span>
      <Link to={path} className="font-medium underline underline-offset-2">Add picture</Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-1 hover:bg-brand-100"><X className="size-4" aria-hidden /></button>
    </div>
  )
}
