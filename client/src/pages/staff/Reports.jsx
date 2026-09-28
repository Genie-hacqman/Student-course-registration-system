import { useMemo, useState } from 'react'
import { ArrowDownUp } from 'lucide-react'
import { useCoursePopularity, useRegistrationSummary } from '../../api/staff'
import { Card, CardHeader, EmptyState, PageHeader, QueryState, cx } from '../../components/ui'
import { FillRateChart, SemesterSelect, StatusChart, Stat, useSemesterParam } from '../../components/staff'

const COLUMNS = [
  ['code', 'Course'],
  ['sectionCode', 'Section'],
  ['seatsTaken', 'Seats'],
  ['fillRate', 'Filled'],
  ['waitlisted', 'Waitlisted'],
]

function PopularityTable({ sections }) {
  const [sort, setSort] = useState({ key: 'fillRate', dir: -1 })
  const rows = useMemo(() => [...sections].sort((a, b) => {
    const x = a[sort.key]
    const y = b[sort.key]
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
  }), [sections, sort])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            {COLUMNS.map(([key, label], i) => (
              <th key={key} className={cx('py-3 font-medium', i === 0 && 'px-5')}>
                <button
                  className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
                  onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
                >
                  {label} <ArrowDownUp className={cx('size-3', sort.key === key ? 'text-brand-600' : 'text-slate-300')} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((s) => (
            <tr key={s.sectionId}>
              <td className="px-5 py-3"><span className="font-medium">{s.code}</span> <span className="text-slate-600">{s.title}</span></td>
              <td className="py-3">{s.sectionCode}</td>
              <td className="py-3 tabular-nums">{s.seatsTaken} / {s.capacity}</td>
              <td className={cx('py-3 font-medium tabular-nums', s.fillRate >= 100 ? 'text-red-600' : s.fillRate >= 90 ? 'text-amber-600' : '')}>{s.fillRate}%</td>
              <td className="py-3 tabular-nums">{s.waitlisted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Reports() {
  const { semesterId, setSemesterId, semesters, semester } = useSemesterParam()
  const summary = useRegistrationSummary(semesterId, { enabled: Boolean(semesterId) })
  const popularity = useCoursePopularity(semesterId, { enabled: Boolean(semesterId) })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={semester ? `${semester.name}${semester.academicYear ? ` · ${semester.academicYear.name}` : ''}` : undefined}
        action={<SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />}
      />

      <QueryState query={summary}>
        {(s) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Students registered" value={s.students} />
              <Stat label="Course registrations" value={s.registeredItems} />
              <Stat label="Total credits" value={s.totalCredits} />
              <Stat label="Avg. credits / student" value={s.students ? (s.totalCredits / s.students).toFixed(1) : '–'} />
            </div>
            <Card>
              <CardHeader title="Registration summary" subtitle="Registrations per status and their average credit load" />
              <div className="grid gap-6 p-4 lg:grid-cols-3">
                <div className="lg:col-span-2"><StatusChart byStatus={s.byStatus} /></div>
                <ul className="space-y-2 self-center text-sm">
                  {s.byStatus.length ? s.byStatus.map((b) => (
                    <li key={b.status} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="capitalize">{b.status}</span>
                      <span className="tabular-nums text-slate-600">{b.count} · avg {Number(b.avgCredits).toFixed(1)} cr</span>
                    </li>
                  )) : <li className="text-slate-500">No registrations yet.</li>}
                </ul>
              </div>
            </Card>
          </>
        )}
      </QueryState>

      <Card>
        <CardHeader title="Course popularity" subtitle="Seat fill rate per section. Red is full, amber is 90% or more." />
        <QueryState query={popularity}>
          {({ sections }) => (sections.length ? (
            <>
              <div className="p-4"><FillRateChart sections={sections} /></div>
              <div className="border-t border-slate-100"><PopularityTable sections={sections} /></div>
            </>
          ) : <EmptyState title="No sections this semester" />)}
        </QueryState>
      </Card>
    </div>
  )
}
