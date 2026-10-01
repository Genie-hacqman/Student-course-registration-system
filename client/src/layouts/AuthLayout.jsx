import { Outlet } from 'react-router-dom'
import { BadgeCheck, GraduationCap, LayoutDashboard, Users } from 'lucide-react'
import { cx } from '../components/ui'
import authIllustration from '../assets/auth-illustration.svg'

const FEATURES = [
  { icon: Users, label: 'Real-time seat availability, before you register', stagger: 'animate-slide-up-3' },
  { icon: BadgeCheck, label: 'Instant approval tracking, no more guessing', stagger: 'animate-slide-up-4' },
  { icon: LayoutDashboard, label: 'One dashboard for courses, timetable, and results', stagger: 'animate-slide-up-5' },
]

export default function AuthLayout() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-linear-to-br from-brand-50 via-white to-slate-50 lg:flex-row">
      {/* One shared mesh-gradient background for the whole page — visible on every screen size,
          not just the desktop side panel, so the mobile view isn't left plain. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-20 left-[15%] size-80 rounded-full bg-brand-200/50 blur-3xl animate-float sm:size-96" />
        <div className="absolute top-1/3 -right-16 size-72 rounded-full bg-brand-300/35 blur-3xl animate-float-delayed sm:size-80" />
        <div className="absolute -bottom-24 left-[20%] size-64 rounded-full bg-brand-100/60 blur-3xl animate-float sm:size-72" />
        <div
          aria-hidden="true"
          className="absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-50"
          style={{ backgroundImage: 'radial-gradient(#bdd0fd 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 lg:max-w-xl lg:px-16 xl:max-w-2xl">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:mb-12 lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:text-left">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25 lg:size-10 lg:rounded-xl">
              <GraduationCap className="size-7 lg:size-5" />
            </div>
            <div>
              <p className="text-xl font-semibold tracking-tight text-slate-900 lg:text-base">UniReg</p>
              <p className="text-sm text-slate-500 lg:hidden">Student Course Registration</p>
            </div>
          </div>
          <div className="animate-slide-up rounded-2xl bg-white/95 p-6 shadow-lg ring-1 ring-slate-200 backdrop-blur-sm sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>

      <aside className="relative hidden flex-1 flex-col items-center justify-center px-12 py-16 lg:flex">
        <div className="relative mx-auto max-w-md text-center">
          <h2 className="animate-slide-up-1 text-3xl font-semibold tracking-tight text-slate-900">
            Your whole semester, one login away.
          </h2>
          <p className="animate-slide-up-2 mt-3 text-base text-slate-600">
            Browse open sections, register for courses, and track every approval — all from the dashboard built for UniReg students.
          </p>

          <img src={authIllustration} alt="" aria-hidden="true" className="animate-illustration mx-auto mt-10 w-full max-w-sm" />

          <ul className="mt-10 space-y-3 text-left">
            {FEATURES.map(({ icon: Icon, label, stagger }) => (
              <li key={label} className={cx('flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-xs ring-1 ring-slate-900/5', stagger)}>
                <Icon className="size-5 shrink-0 text-brand-600" />
                <span className="text-sm font-medium text-slate-700">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
