import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { ContactDetails } from '../components/SiteFooter'
import { hasContact } from '../lib/site'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-slate-900 to-brand-900 px-4 py-12 text-center text-white">
      <BrandMark className="size-14 rounded-2xl shadow-lg shadow-brand-950/40 ring-1 ring-white/30" />
      <p className="mt-8 text-6xl font-bold tracking-tight text-white/90">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">We can't find that page</h1>
      <p className="mt-2 max-w-sm text-sm text-white/80">
        The link may be out of date or mistyped. Head back to UniReg and pick up from there.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Go to UniReg
        </Link>
        <Link to="/apply" className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Apply for admission
        </Link>
      </div>
      {hasContact && (
        <div className="mt-10 text-sm text-white/80">
          <p className="mb-2">Still stuck? Contact the registry.</p>
          <div className="flex justify-center"><ContactDetails /></div>
        </div>
      )}
    </main>
  )
}
