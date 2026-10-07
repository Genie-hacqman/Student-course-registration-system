import { Fragment, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, CornerDownLeft, KeyRound, LogOut, Menu, Search,
  UserRound, X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { AnimatePresence, m } from 'motion/react'
import { Avatar, Loading, cx, useFocusTrap } from '../components/ui'
import BrandMark from '../components/BrandMark'
import { EASE_OUT, SOFT_SPRING, pageEnter, popover, slideIn, stagger } from '../lib/motionPresets'
import { NotificationCenter } from '../components/dashboard/NotificationItems'
import { fullName } from '../lib/format'
import { ROLE_LABELS } from '../lib/roles'
import { SEGMENT_LABELS, flatNav } from '../lib/nav'
import { VerifyEmailBanner } from '../components/account/Account'
import AddPhotoBanner from '../components/account/AddPhotoBanner'

const COLLAPSE_KEY = 'unireg.sidebar.collapsed'

const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const isActive = (item, location) => {
  const [path] = item.to.split('?')
  const pathOk = item.end ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`)
  return pathOk && (item.match ? item.match(location) : true)
}

function NavLinkItem({ item, rail, onNavigate, nested }) {
  const location = useLocation()
  const active = isActive(item, location)
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
      className={cx(
        'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
        rail ? 'justify-center p-2.5' : nested ? 'py-1.5 pr-3 pl-9' : 'px-3 py-2',
        active
          ? 'bg-brand-50 text-brand-700 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-600'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {(!nested || rail) && <Icon className={cx('size-4.5 shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />}
      {rail ? <span className="sr-only">{item.label}</span> : <span className="line-clamp-2 leading-snug">{item.label}</span>}
    </Link>
  )
}

function NavGroup({ group, onNavigate }) {
  const location = useLocation()
  const containsActive = group.items.some((i) => isActive(i, location))
  const [open, setOpen] = useState(containsActive)
  const id = useId()
  const expanded = open || containsActive
  const Icon = group.icon
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        aria-controls={id}
        className={cx(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
          containsActive ? 'text-slate-900' : 'text-slate-600',
        )}
      >
        <Icon className={cx('size-4.5 shrink-0', containsActive ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
        <span className="line-clamp-2 flex-1 text-left leading-snug">{group.label}</span>
        <ChevronDown className={cx('size-4 text-slate-400 transition-transform duration-200', expanded ? 'rotate-0' : '-rotate-90')} aria-hidden />
      </button>
      <div id={id} className={cx('grid transition-[grid-template-rows] duration-200', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 pb-1" inert={!expanded || undefined}>
            {group.items.map((item) => <NavLinkItem key={item.label} item={item} nested onNavigate={onNavigate} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

const navItem = slideIn(-12)

function NavTree({ nav, rail, onNavigate }) {
  return (
    <m.nav aria-label="Main" className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1" initial="hidden" animate="show" variants={stagger(0.035, 0.12)}>
      {nav.map((entry, i) => {
        if (!entry.items) return <m.div key={entry.label} variants={navItem}><NavLinkItem item={entry} rail={rail} onNavigate={onNavigate} /></m.div>
        if (rail) {
          return (
            <Fragment key={entry.label}>
              {i > 0 && <hr className="mx-2 my-1.5 border-slate-100" />}
              {entry.items.map((item) => (
                <m.div key={`${entry.label}-${item.label}`} variants={navItem}><NavLinkItem item={item} rail onNavigate={onNavigate} /></m.div>
              ))}
            </Fragment>
          )
        }
        return <m.div key={entry.label} variants={navItem}><NavGroup group={entry} onNavigate={onNavigate} /></m.div>
      })}
    </m.nav>
  )
}

function Brand({ home, role, rail }) {
  return (
    <Link to={home} className={cx('flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600', rail ? 'justify-center' : 'px-2')}>
      <BrandMark className="size-9 rounded-xl shadow-sm ring-1 ring-slate-200" />
      {!rail && (
        <span className="min-w-0 leading-tight">
          <span className="block font-semibold tracking-tight">UniReg</span>
          <span className="block truncate text-xs text-slate-500">{ROLE_LABELS[role] ?? 'Portal'} portal</span>
        </span>
      )}
      {rail && <span className="sr-only">UniReg home</span>}
    </Link>
  )
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return <p className="truncate text-sm font-medium text-slate-900">Dashboard</p>
  const crumbs = parts.map((seg, i) => ({
    label: i === 0 ? 'Dashboard' : SEGMENT_LABELS[seg] ?? 'Details',
    to: `/${parts.slice(0, i + 1).join('/')}`,
  }))
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden />}
            {i === crumbs.length - 1
              ? <span aria-current="page" className="truncate font-medium text-slate-900">{c.label}</span>
              : <Link to={c.to} className="truncate text-slate-500 hover:text-slate-900">{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function QuickJump({ nav, open, onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  const listId = useId()
  useFocusTrap(ref, open, onClose)

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    const seen = new Set()
    return flatNav(nav)
      .filter((i) => { if (seen.has(i.to)) return false; seen.add(i.to); return true })
      .filter((i) => !term || `${i.label} ${i.group ?? ''}`.toLowerCase().includes(term))
  }, [nav, q])

  if (!open) return null
  const go = (item) => { onClose(); setQ(''); navigate(item.to) }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Go to page" className="relative w-full max-w-lg animate-modal-in overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="size-4 text-slate-400" aria-hidden />
          <input
            data-autofocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-[11px] text-slate-400">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length ? results.map((item, i) => {
            const Icon = item.icon
            return (
              <li
                key={item.to}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-brand-50 text-brand-800' : 'text-slate-700')}
              >
                <Icon className="size-4 text-slate-400" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.group && <span className="text-xs text-slate-400">{item.group}</span>}
                {i === active && <CornerDownLeft className="size-3.5 text-slate-400" aria-hidden />}
              </li>
            )
          }) : <li className="px-3 py-6 text-center text-sm text-slate-500">No pages match “{q}”.</li>}
        </ul>
      </div>
    </div>
  )
}

function ProfileMenu({ user, profilePath, settingsPath, onSignOut }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef(null)
  const menu = useRef(null)
  useFocusTrap(menu, open, () => setOpen(false))
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => { if (!wrapper.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600'
  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 sm:pr-2"
      >
        <Avatar user={user} size="sm" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium">{fullName(user)}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[user?.role?.name]}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 md:block" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <m.div ref={menu} role="menu" {...popover} style={{ transformOrigin: 'top right' }} className="absolute right-0 z-50 mt-2 w-64 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 pt-1.5 pb-2.5">
              <Avatar user={user} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{fullName(user)}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <div className="py-1">
              <Link role="menuitem" to={profilePath} onClick={() => setOpen(false)} className={item}><UserRound className="size-4 text-slate-400" aria-hidden /> Profile</Link>
              <Link role="menuitem" to={settingsPath} onClick={() => setOpen(false)} className={item}><KeyRound className="size-4 text-slate-400" aria-hidden /> Settings & security</Link>
            </div>
            <div className="border-t border-slate-100 pt-1">
              <button role="menuitem" type="button" onClick={onSignOut} className={cx(item, 'text-red-700 hover:bg-red-50')}><LogOut className="size-4" aria-hidden /> Sign out</button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AppShell({ nav, home, notificationsPath, profilePath, settingsPath }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const isMd = useMediaQuery('(min-width: 768px)')
  const isLg = useMediaQuery('(min-width: 1024px)')
  const rail = isMd && (!isLg || collapsed)
  const drawerRef = useRef(null)
  useFocusTrap(drawerRef, drawer, () => setDrawer(false))

  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setDrawer(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch {}
      return !c
    })
  }

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const role = user?.role?.name

  return (
    <div className={cx('min-h-full', rail ? 'md:pl-19' : 'md:pl-19 lg:pl-64')}>
      <a href="#main" className="sr-only z-60 rounded-lg bg-white px-4 py-2 font-medium text-brand-700 shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to main content
      </a>

      <m.aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-30 hidden flex-col gap-4 border-r border-slate-200 bg-white py-4 transition-[width] duration-200 md:flex',
          rail ? 'w-19 px-3' : 'w-64 px-3',
        )}
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SOFT_SPRING}
      >
        <div className="border-b border-slate-100 pb-4"><Brand home={home} role={role} rail={rail} /></div>
        <NavTree nav={nav} rail={rail} />
        {isLg && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800', rail && 'justify-center')}
          >
            {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <><ChevronsLeft className="size-4" aria-hidden /> Collapse</>}
          </button>
        )}
      </m.aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu" className="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col gap-4 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <Brand home={home} role={role} />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-slate-100">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <NavTree nav={nav} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <m.header
        className="no-print sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:gap-3 sm:px-6"
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.05 }}
      >
        <button type="button" onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-2 hover:bg-slate-100 md:hidden" aria-label="Open menu">
          <Menu className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1"><Breadcrumbs /></div>
        <button
          type="button"
          onClick={() => setSearch(true)}
          className="flex items-center gap-2 rounded-lg p-2 text-sm text-slate-500 ring-slate-200 transition hover:bg-slate-100 sm:w-56 sm:bg-slate-50 sm:px-3 sm:ring-1 sm:hover:bg-white"
          aria-label="Search pages"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden flex-1 text-left sm:block">Search pages…</span>
          <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[11px] sm:block">⌘K</kbd>
        </button>
        <NotificationCenter allPath={notificationsPath} />
        <ProfileMenu user={user} profilePath={profilePath} settingsPath={settingsPath} onSignOut={signOut} />
      </m.header>

      <VerifyEmailBanner />
      <AddPhotoBanner path={profilePath} />
      <main id="main" tabIndex={-1} className="print-area mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<Loading />}>
          <m.div key={location.pathname} {...pageEnter}>
            <Outlet />
          </m.div>
        </Suspense>
      </main>

      <QuickJump nav={nav} open={search} onClose={() => setSearch(false)} />
    </div>
  )
}
