import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-slate-600">This page doesn't exist.</p>
      <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">Go home</Link>
    </div>
  )
}
