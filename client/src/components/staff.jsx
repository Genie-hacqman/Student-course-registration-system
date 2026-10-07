import { useSearchParams } from 'react-router-dom'
import { useSemesters } from '../api/staff'
import { Select } from './ui'

export function useSemesterParam() {
  const [params, setParams] = useSearchParams()
  const semesters = useSemesters()
  const current = semesters.data?.find((s) => s.isCurrent)
  const semesterId = params.get('semester') ?? (current ? String(current.id) : null)
  const setSemesterId = (id) => {
    const next = new URLSearchParams(params)
    next.set('semester', id)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const semester = semesters.data?.find((s) => String(s.id) === semesterId)
  return { semesterId, setSemesterId, semester, semesters }
}

export function SemesterSelect({ value, onChange, semesters }) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label="Semester" className="w-full sm:w-80">
      {!semesters.data && <option value="">Loading…</option>}
      {semesters.data?.map((s) => (
        <option key={s.id} value={s.id}>{s.name}{s.academicYear ? ` · ${s.academicYear.name}` : ''}{s.isCurrent ? ' (current)' : ''}</option>
      ))}
    </Select>
  )
}

export { StatCard as Stat } from './dashboard/StatCard'
export { StatusChart, FillRateChart } from './charts/Charts'
