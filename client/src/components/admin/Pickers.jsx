import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useApi } from '../../api/admin'
import { Select, Spinner, cx } from '../ui'
import { fullName, lecturerName } from '../../lib/format'

const useDebounced = (value, ms = 250) => {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function SearchPicker({ label, value, onChange, path, toOption, placeholder, error, exclude = [], extraParams }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const term = useDebounced(query)
  const box = useRef(null)
  const results = useApi(open ? path : null, { search: term || undefined, limit: 10, ...extraParams })
  const options = (results.data?.items ?? []).map(toOption).filter((o) => !exclude.includes(o.id))

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (o) => {
    setSelected(o)
    onChange(o.id, o)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="block" ref={box}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      {value && selected?.id === value ? (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
          <span><span className="font-medium">{selected.label}</span> {selected.sub && <span className="text-slate-500">{selected.sub}</span>}</span>
          <button type="button" onClick={() => onChange(undefined)} className="rounded p-0.5 text-slate-400 hover:bg-slate-200" aria-label="Clear">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            aria-label={label}
            className={cx(
              'block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:outline-none',
              error ? 'ring-red-400' : 'ring-slate-300 focus:ring-brand-500',
            )}
          />
          {open && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
              {results.isFetching && !options.length && <li className="flex items-center gap-2 px-3 py-2 text-slate-500"><Spinner className="size-4" /> Searching…</li>}
              {!results.isFetching && !options.length && <li className="px-3 py-2 text-slate-500">No matches</li>}
              {options.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => choose(o)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
                    <span className="font-medium">{o.label}</span> {o.sub && <span className="text-slate-500">{o.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  )
}

export function CoursePicker(props) {
  return (
    <SearchPicker
      path="/courses"
      placeholder="Search by course code or title…"
      toOption={(c) => ({ id: c.id, label: c.code, sub: `${c.title} · ${c.credits} cr${c.status === 'inactive' ? ' · inactive' : ''}` })}
      {...props}
    />
  )
}

export function StudentPicker(props) {
  return (
    <SearchPicker
      path="/students"
      placeholder="Search by name, student number or email…"
      toOption={(s) => ({ id: s.id, label: fullName(s.user), sub: `${s.studentNumber} · level ${s.level}` })}
      {...props}
    />
  )
}

export function LecturerSelect({ label = 'Lecturer', error, ...props }) {
  const lecturers = useApi('/lecturers', { limit: 100, sort: 'staffNumber' })
  return (
    <Select label={label} error={error} disabled={lecturers.isPending} {...props}>
      <option value="">{lecturers.isPending ? 'Loading…' : 'Not assigned yet'}</option>
      {lecturers.data?.items.map((l) => (
        <option key={l.id} value={l.id}>{lecturerName(l)} · {l.department?.code ?? '—'} · {l.staffNumber}</option>
      ))}
    </Select>
  )
}
