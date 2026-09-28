import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '../api/client'
import { Badge, Button, Card, CardHeader, EmptyState, QueryState, cx } from './ui'
import ConfirmDialog from './admin/ConfirmDialog'

// Mirrors GRADE_SCALE in SCRS-backend src/utils/grades.js. W (withdrawn) and I (incomplete) carry no points.
export const GRADES = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E', 'F', 'W', 'I']

/**
 * Grade entry for one section. Grades save as provisional (students can't see them) until the
 * section is finalised, after which only the registry can amend a result.
 */
export default function GradeSheet({ sectionId }) {
  const qc = useQueryClient()
  const key = ['grades', String(sectionId)]
  const sheet = useQuery({ queryKey: key, queryFn: () => api.get(`/sections/${sectionId}/grades`).then(unwrap) })
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [missing, setMissing] = useState(new Set())

  const students = useMemo(() => sheet.data?.students ?? [], [sheet.data])
  const valueOf = (s) => draft[s.studentId] ?? s.grade ?? ''
  const changed = useMemo(
    () => students.filter((s) => draft[s.studentId] && draft[s.studentId] !== s.grade),
    [students, draft],
  )
  const gradedCount = students.filter((s) => valueOf(s)).length

  const save = async () => {
    setSaving(true)
    try {
      const data = await api.put(`/sections/${sectionId}/grades`, {
        grades: changed.map((s) => ({ studentId: s.studentId, grade: draft[s.studentId] })),
      }).then(unwrap)
      qc.setQueryData(key, data)
      setDraft({})
      toast.success(`${changed.length} grade${changed.length === 1 ? '' : 's'} saved as provisional`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const finalize = async () => {
    try {
      const data = await api.post(`/sections/${sectionId}/grades/finalize`).then(unwrap)
      qc.setQueryData(key, data)
      setMissing(new Set())
      toast.success('Grades are final and students have been notified')
    } catch (err) {
      // 422 lists the students still without a grade.
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) setMissing(new Set(err.details.map((d) => d.studentId)))
      throw err
    }
  }

  return (
    <Card>
      <QueryState query={sheet}>
        {(data) => (
          <>
            <CardHeader
              title="Grades"
              subtitle={data.finalized
                ? 'These grades are final. Ask the registry to amend a result if one is wrong.'
                : 'Grades are provisional until you finalise them — students only see final grades.'}
              action={data.finalized
                ? <Badge tone="green"><Lock className="size-3" /> Final</Badge>
                : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={!changed.length} loading={saving} onClick={save}>
                      Save {changed.length ? `(${changed.length})` : ''}
                    </Button>
                    <Button size="sm" disabled={!students.length || changed.length > 0} onClick={() => setFinalizing(true)}>
                      <CheckCircle2 className="size-4" /> Finalise
                    </Button>
                  </div>
                )}
            />
            {students.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-medium">Student</th>
                      <th className="py-3 font-medium">Student no.</th>
                      <th className="py-3 font-medium">Grade</th>
                      <th className="px-5 py-3 font-medium">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((s) => (
                      <tr key={s.studentId} className={cx(missing.has(s.studentId) && 'bg-red-50')}>
                        <td className="px-5 py-2.5 font-medium">{s.name}</td>
                        <td className="py-2.5 tabular-nums">{s.studentNumber}</td>
                        <td className="py-2.5">
                          {data.finalized ? <span className="font-semibold">{s.grade}</span> : (
                            <select
                              aria-label={`Grade for ${s.name}`}
                              value={valueOf(s)}
                              onChange={(e) => setDraft((d) => ({ ...d, [s.studentId]: e.target.value }))}
                              className={cx(
                                'rounded-lg border-0 bg-white py-1.5 pr-8 pl-3 text-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-500',
                                draft[s.studentId] && draft[s.studentId] !== s.grade ? 'ring-brand-500' : 'ring-slate-300',
                              )}
                            >
                              <option value="">—</option>
                              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          {s.status ? <Badge tone={s.status === 'final' ? 'green' : 'slate'}>{s.status}</Badge> : <span className="text-slate-400">not yet</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.finalized && (
                  <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                    {gradedCount} of {students.length} graded{changed.length ? ' · save your changes before finalising' : ''}
                  </p>
                )}
              </div>
            ) : (
              <EmptyState title="No students to grade">Only students whose registration has been approved appear here.</EmptyState>
            )}
            <ConfirmDialog
              open={finalizing}
              onClose={() => setFinalizing(false)}
              title="Finalise these grades?"
              confirmLabel="Finalise"
              danger={false}
              onConfirm={finalize}
            >
              <p>All {students.length} students will see their grade and be notified. After this, only the registry can change a grade.</p>
            </ConfirmDialog>
          </>
        )}
      </QueryState>
    </Card>
  )
}
