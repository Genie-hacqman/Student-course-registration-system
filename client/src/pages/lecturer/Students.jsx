import { useMemo, useState } from 'react'
import { Search, UsersRound } from 'lucide-react'
import { currentSections, useMySections, useRosters } from '../../api/lecturer'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Select, SkeletonTable, StatusBadge } from '../../components/ui'
import { FilterBar } from '../../components/dashboard/Widgets'
import { fullName } from '../../lib/format'

export default function LecturerStudents() {
  const sections = useMySections()
  const current = useMemo(() => currentSections(sections.data ?? []), [sections.data])
  const rosters = useRosters(current.map((s) => s.id))
  const [q, setQ] = useState('')
  const [course, setCourse] = useState('')

  const students = useMemo(() => {
    const map = new Map()
    rosters.forEach((r, i) => {
      const section = current[i]
      for (const s of r.data?.students ?? []) {
        const entry = map.get(s.id) ?? { ...s, courses: [] }
        entry.courses.push({ id: section.id, label: `${section.course.code}-${section.sectionCode}`, status: s.registrationStatus })
        map.set(s.id, entry)
      }
    })
    return [...map.values()].sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)))
  }, [rosters, current])

  const loading = sections.isPending || rosters.some((r) => r.isPending)
  const failed = sections.isError ? sections : rosters.find((r) => r.isError)
  const term = q.trim().toLowerCase()
  const shown = students.filter((s) => (!course || s.courses.some((c) => String(c.id) === course))
    && (!term || `${fullName(s.user)} ${s.studentNumber} ${s.user?.email}`.toLowerCase().includes(term)))

  return (
    <div className="space-y-6">
      <PageHeader title="Students" subtitle="Everyone registered in your current courses." />
      <FilterBar summary={!loading && `${shown.length} of ${students.length} students`} onClear={q || course ? () => { setQ(''); setCourse('') } : undefined}>
        <label className="relative flex-1">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, student number or email…"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </label>
        <Select aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)} className="md:w-64">
          <option value="">All courses</option>
          {current.map((s) => <option key={s.id} value={s.id}>{s.course.code} · Section {s.sectionCode}</option>)}
        </Select>
      </FilterBar>
      <Card>
        {failed ? <ErrorState error={failed.error} onRetry={() => failed.refetch()} /> : loading ? <SkeletonTable rows={6} /> : shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Student</th>
                  <th scope="col" className="py-3 font-medium">Student no.</th>
                  <th scope="col" className="py-3 font-medium">Level</th>
                  <th scope="col" className="px-5 py-3 font-medium">Courses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-2.5"><span className="font-medium">{fullName(s.user)}</span><p className="text-xs text-slate-500">{s.user?.email}</p></td>
                    <td className="py-2.5 tabular-nums">{s.studentNumber}</td>
                    <td className="py-2.5">{s.level}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {s.courses.map((c) => (c.status === 'approved'
                          ? <Badge key={c.id} tone="blue">{c.label}</Badge>
                          : <StatusBadge key={c.id} status={c.status} label={`${c.label} · ${c.status === 'submitted' ? 'pending' : c.status}`} />))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={students.length ? 'No students match' : 'No students found'} icon={UsersRound}>{!students.length && 'Students appear here as they register for your courses.'}</EmptyState>}
      </Card>
    </div>
  )
}
