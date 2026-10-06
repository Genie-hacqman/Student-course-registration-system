import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { m } from 'motion/react'
import { BadgeCheck, GraduationCap, LayoutDashboard, Users } from 'lucide-react'
import campusPhoto from '../assets/UniReg.jpeg'
import SiteFooter from '../components/SiteFooter'
import { EASE_OUT, SOFT_SPRING, fadeUp, pop, slideIn, stagger } from '../lib/motionPresets'

const FEATURES = [
  { icon: Users, label: 'Real-time seat availability, before you register' },
  { icon: BadgeCheck, label: 'Instant approval tracking, no more guessing' },
  { icon: LayoutDashboard, label: 'One dashboard for courses, timetable, and results' },
]
const HEADLINE = 'Your whole semester, one login away.'

// Soft shadow under light text, so it stays readable over the brighter parts of the photo.
const TEXT_SHADOW = { textShadow: '0 1px 12px rgb(2 6 23 / 0.55)' }

/**
 * Animates its own height to fit its content, so the card glides to a new size (Sign in → Apply, or when an error
 * message appears) instead of jumping. Measures with ResizeObserver; with none available it simply sizes naturally.
 */
function AutoHeight({ children }) {
  const inner = useRef(null)
  const [height, setHeight] = useState('auto')
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !inner.current) return undefined
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height))
    observer.observe(inner.current)
    return () => observer.disconnect()
  }, [])
  return (
    // content-box: the measured height is the content's own, so the 4px halo (padding, cancelled by the negative margin,
    // which keeps focus rings and shadows from being clipped) must sit outside it, not eat into it.
    <m.div animate={{ height }} initial={false} transition={{ duration: 0.35, ease: EASE_OUT }} style={{ boxSizing: 'content-box', overflow: 'hidden', margin: -4, padding: 4 }}>
      <div ref={inner}>{children}</div>
    </m.div>
  )
}

export default function AuthLayout() {
  const { pathname } = useLocation()
  return (
    <div className="relative isolate flex min-h-full flex-col overflow-hidden bg-slate-900 lg:flex-row">
      {/* The campus photo behind every sign-in page, on every screen size. It is low resolution, so it is softened
          slightly (reads as depth of field), and it settles from a slight zoom to rest on load. It stays scaled up so
          the film date stamp in its corner is cropped away. Layered overlays keep all text above WCAG AA contrast.
          This layer clips its own overflow: the scaled-up photo would otherwise make the page scrollable by a few
          dozen pixels (even though it is hidden), and focusing or clicking a control would shift the whole layout. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <m.img
          src={campusPhoto}
          alt=""
          fetchPriority="high"
          className="size-full object-cover object-[60%_35%] blur-[2px]"
          initial={{ scale: 1.24, opacity: 0 }}
          animate={{ scale: 1.1, opacity: 1 }}
          transition={{ scale: { duration: 2.2, ease: EASE_OUT }, opacity: { duration: 0.8 } }}
        />
        <div className="absolute inset-0 bg-slate-950/50 lg:bg-slate-950/40" />
        <div className="absolute inset-0 bg-linear-to-b from-slate-950/30 via-transparent to-slate-950/50 lg:bg-linear-to-r lg:from-slate-950/80 lg:via-slate-950/30 lg:to-slate-950/10" />
        <div className="absolute inset-0 bg-brand-900/20 mix-blend-multiply" />
      </div>

      {/* On /login the mobile Apply bar is fixed to the bottom, so that page needs room under the footer for it. */}
      <div className={`relative flex flex-1 flex-col items-center justify-center px-4 py-12 lg:max-w-xl lg:px-16 xl:max-w-2xl ${pathname === '/login' ? 'pb-28 lg:pb-12' : ''}`}>
        <div className="w-full max-w-md">
          <m.div
            className="mb-8 flex flex-col items-center gap-2 text-center lg:mb-12 lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:text-left"
            initial="hidden"
            animate="show"
            variants={stagger(0.08, 0.1)}
          >
            <m.div variants={pop} className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-950/40 ring-1 ring-white/20 lg:size-10 lg:rounded-xl">
              <GraduationCap className="size-7 lg:size-5" />
            </m.div>
            <m.div variants={fadeUp} style={TEXT_SHADOW}>
              <p className="text-xl font-semibold tracking-tight text-white lg:text-base">UniReg</p>
              <p className="text-sm text-white/80 lg:hidden">Student Course Registration</p>
            </m.div>
          </m.div>
          {pathname === '/login' && (
            <p className="-mt-4 mb-6 text-center text-sm text-white/85 lg:hidden" style={TEXT_SHADOW}>
              Register for courses, track approvals, and see your timetable and results.
            </p>
          )}
          {/* The glass card rises in on a spring, then smoothly resizes (instead of jumping) when you move between
              Sign in, Apply and the other forms, while the form inside crossfades. */}
          <m.div
            className="auth-glass bg-white/90 p-6 shadow-[0_25px_50px_-12px_rgb(2_6_23/0.55),inset_0_1px_0_rgb(255_255_255/0.7)] ring-1 ring-white/50 backdrop-blur-2xl backdrop-saturate-150 sm:p-8"
            style={{ borderRadius: 16 }}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SOFT_SPRING, delay: 0.15 }}
          >
            <AutoHeight>
              <m.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.08, ease: EASE_OUT }}
              >
                <Outlet />
              </m.div>
            </AutoHeight>
          </m.div>
          <SiteFooter className="mt-8" />
        </div>
      </div>

      <aside className="relative hidden flex-1 flex-col items-center justify-center px-12 py-16 lg:flex">
        <m.div
          className="relative mx-auto max-w-md text-center"
          style={TEXT_SHADOW}
          initial="hidden"
          animate="show"
          variants={stagger(0.05, 0.35)}
        >
          {/* The headline reveals word by word; screen readers get it whole. */}
          <h2 className="text-4xl font-semibold tracking-tight text-white" aria-label={HEADLINE}>
            {HEADLINE.split(' ').map((word, i) => (
              <m.span key={i} variants={fadeUp} aria-hidden="true" className="mr-[0.25em] inline-block last:mr-0">{word}</m.span>
            ))}
          </h2>
          <m.p variants={fadeUp} className="mt-4 text-base text-white/85">
            Browse open sections, register for courses, and track every approval — all from the dashboard built for UniReg students.
          </m.p>

          <m.ul variants={stagger(0.1, 0.15)} className="mt-10 space-y-3 text-left">
            {FEATURES.map(({ icon: Icon, label }) => (
              <m.li
                key={label}
                variants={slideIn(28)}
                className="flex items-center gap-3 rounded-xl bg-slate-950/35 px-4 py-3 ring-1 ring-white/15 backdrop-blur-md"
              >
                <Icon className="size-5 shrink-0 text-brand-200" />
                <span className="text-sm font-medium text-white">{label}</span>
              </m.li>
            ))}
          </m.ul>
        </m.div>
      </aside>
    </div>
  )
}
