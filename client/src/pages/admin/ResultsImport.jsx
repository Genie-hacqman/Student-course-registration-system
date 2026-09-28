import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { http, useApiMutation } from '../../api/admin'
import { Button, Card, CardHeader, PageHeader } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { GRADES } from '../../components/GradeSheet'

/** Parses "studentNumber,courseCode,grade[,semesterId]" lines; a header row is skipped. */
const parse = (text) => text
  .split(/\r?\n/)
  .map((line, i) => ({ line: i + 1, cells: line.split(',').map((c) => c.trim()) }))
  .filter(({ cells }) => cells.some(Boolean))
  .filter(({ cells }, i) => !(i === 0 && /student/i.test(cells[0])))
  .map(({ line, cells: [studentNumber, courseCode, grade, semesterId] }) => {
    const problem = !studentNumber || !courseCode || !grade ? 'Needs student number, course code and grade'
      : !GRADES.includes(grade.toUpperCase()) ? `Unknown grade ${grade}`
        : semesterId && !/^\d+$/.test(semesterId) ? 'Semester must be a number (its id)' : null
    return { line, studentNumber, courseCode, grade: grade?.toUpperCase(), semesterId: semesterId ? Number(semesterId) : undefined, problem }
  })

export default function ResultsImport() {
  const [text, setText] = useState('')
  const rows = useMemo(() => parse(text), [text])
  const valid = rows.filter((r) => !r.problem)
  const [report, setReport] = useState(null)
  const importRows = useApiMutation((results) => http.post('/results/import', { results }))

  const submit = async () => {
    const res = await importRows.mutateAsync(valid.map(({ studentNumber, courseCode, grade, semesterId }) => ({
      studentNumber, courseCode, grade, ...(semesterId ? { semesterId } : {}),
    })))
    setReport({ ...res, lines: valid.map((r) => r.line) })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Import results" subtitle="Record official (final) grades in bulk — for example history from a previous system or transfer credit." />
      <Card>
        <CardHeader title="Paste results" subtitle="One per line: student number, course code, grade, and optionally a semester id. Existing results for the same student, course and semester are replaced." />
        <div className="space-y-3 px-5 py-4">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setReport(null) }}
            rows={8}
            aria-label="Results"
            placeholder={'studentNumber,courseCode,grade,semesterId\nSTU2025001,CS101,A\nSTU2025001,MATH101,B+,1'}
            className="block w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{rows.length} rows · {valid.length} ready{rows.length - valid.length ? ` · ${rows.length - valid.length} with problems` : ''}</span>
            <Button disabled={!valid.length} loading={importRows.isPending} onClick={submit}><Upload className="size-4" /> Import {valid.length || ''}</Button>
          </div>
        </div>
      </Card>

      {report && (
        <Card className="space-y-3 p-5">
          <p className="flex items-center gap-2 font-medium text-green-700"><CheckCircle2 className="size-5" /> {report.imported} imported</p>
          {report.failed > 0 && (
            <div>
              <p className="flex items-center gap-2 font-medium text-red-700"><AlertTriangle className="size-5" /> {report.failed} rejected</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-700">
                {report.errors.map((e) => <li key={e.row}>Line {report.lines[e.row]}: {e.message}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {rows.length > 0 && !report && (
        <Card>
          <CardHeader title="Preview" />
          <DataTable
            rows={rows}
            rowKey={(r) => r.line}
            columns={[
              { key: 'line', header: 'Line' },
              { key: 'studentNumber', header: 'Student no.' },
              { key: 'courseCode', header: 'Course' },
              { key: 'grade', header: 'Grade' },
              { key: 'semesterId', header: 'Semester', render: (r) => r.semesterId ?? '—' },
              { key: 'problem', header: '', render: (r) => r.problem && <span className="text-sm text-red-600">{r.problem}</span> },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
