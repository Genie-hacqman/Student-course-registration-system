import { Link } from 'react-router-dom'
import BrandMark from '../../components/BrandMark'
import { ContactDetails } from '../../components/SiteFooter'
import { hasContact } from '../../lib/site'

export default function LegalLayout({ title, updated, intro, children }) {
  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/login" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
            <BrandMark className="size-8 rounded-lg ring-1 ring-slate-200" />
            UniReg
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>
        <p className="mt-6 text-base text-slate-700">{intro}</p>
        <div className="mt-8 space-y-8">{children}</div>
        <section aria-labelledby="contact-heading" className="mt-12 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h2 id="contact-heading" className="text-lg font-semibold text-slate-900">Questions?</h2>
          <p className="mt-2 text-sm text-slate-600">
            {hasContact ? 'Contact the registry:' : 'Contact the registry, through the office or the email address on your admission letter.'}
          </p>
          <ContactDetails className="mt-3 text-sm text-slate-700" linkClassName="text-brand-600 underline underline-offset-2 hover:text-brand-700" />
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <nav aria-label="Legal" className="flex justify-center gap-4">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-slate-700">Privacy policy</Link>
          <Link to="/terms" className="underline underline-offset-2 hover:text-slate-700">Terms and conditions</Link>
        </nav>
      </footer>
    </div>
  )
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-700 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  )
}
