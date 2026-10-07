import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Copy, Download, FileSpreadsheet, ListChecks, Upload, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { http, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, PageHeader, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { StatCard, StatGrid } from '../../components/dashboard/StatCard'
import {
  COLUMNS, MAX_ROWS, STATUS, checkHeaders, readSpreadsheet, reportCsv, templateCsv, toApiRows,
} from '../../lib/courseImport'

const PAGE_SIZE = 50

const download = (content, name) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CourseImport() {
  const input = useRef(null)
  const [file, setFile] = useState(null)
  const [problem, setProblem] = useState(null)
  const [report, setReport] = useState(null)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const run = useApiMutation(({ rows, dryRun }) => http.post('/admin/import/course-catalog', { rows, dryRun }))

  const reset = () => {
    setFile(null)
    setProblem(null)
    setReport(null)
    setFilter('')
    setPage(1)
    if (input.current) input.current.value = ''
  }

  const choose = async (event) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    reset()
    try {
      const { headers, records } = await readSpreadsheet(chosen)
      const { missing, unknown } = checkHeaders(headers)
      if (missing.length) throw new Error(`The file is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Start from the template.`)
      if (!records.length) throw new Error('The file has a header row but no courses.')
      if (records.length > MAX_ROWS) throw new Error(`The file has ${records.length} rows; import at most ${MAX_ROWS} at a time.`)
      if (unknown.length) toast.warning(`Ignoring unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
      const rows = toApiRows(records)
      setFile({ name: chosen.name, rows })
      setReport(await run.mutateAsync({ rows, dryRun: true }))
    } catch (err) {
      setProblem(err.message)
    }
  }

  const commit = async () => {
    try {
      const result = await run.mutateAsync({ rows: file.rows, dryRun: false })
      setReport(result)
      setFilter('')
      setPage(1)
      if (result.failed) toast.warning(`${result.imported} row(s) imported, ${result.failed} failed. See the report below.`)
      else toast.success(`${result.imported} row(s) imported.`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const imported = report && !report.dryRun
  const shown = (report?.rows ?? []).filter((r) => !filter || r.status === filter)
  const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tabs = imported
    ? [['', 'All'], ['imported', 'Imported'], ['failed', 'Failed'], ['invalid', 'Invalid'], ['duplicate', 'Duplicates']]
    : [['', 'All'], ['valid', 'Ready'], ['invalid', 'Invalid'], ['duplicate', 'Duplicates']]

  return (
    <div className="space-y-6">
      <Link to="/staff/courses" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Courses
      </Link>
      <PageHeader
        title="Import courses"
        subtitle="Add many courses at once from a CSV or Excel (.xlsx) file. Existing courses are never changed, and no sections or timetables are created — schedule sections separately."
      />

      <Card>
        <CardHeader
          icon={FileSpreadsheet}
          title="1. Prepare your file"
          subtitle="One row per course per programme. A course shared by two programmes gets two rows with the same details."
          action={<Button variant="secondary" size="sm" onClick={() => download(templateCsv(), 'course-import-template.csv')}><Download className="size-4" /> Download template</Button>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr><th className="py-2 pr-4 pl-5 font-medium">Column</th><th className="py-2 pr-4 font-medium">Required</th><th className="py-2 pr-4 font-medium">What to enter</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COLUMNS.map(([header, , required, hint]) => (
                <tr key={header}>
                  <td className="py-2 pr-4 pl-5 font-mono text-xs">{header}</td>
                  <td className="py-2 pr-4">{required ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4 text-slate-600">{hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold tracking-tight text-slate-900">2. Upload and check</h2>
        <p className="mt-0.5 text-sm text-slate-500">Nothing is saved yet: every row is checked against the current courses, departments, programmes and academic years.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" id="course-file" onChange={choose} />
          <label htmlFor="course-file" className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            <Upload className="size-4" /> {file ? 'Choose another file' : 'Choose CSV or XLSX'}
          </label>
          {file && <span className="text-sm text-slate-600">{file.name} · {file.rows.length} row{file.rows.length === 1 ? '' : 's'}</span>}
          {run.isPending && <span className="text-sm text-slate-500">Checking…</span>}
        </div>
        {problem && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {problem}
          </p>
        )}
      </Card>

      {report && (
        <>
          <StatGrid>
            {imported ? (
              <>
                <StatCard index={0} label="Imported" icon={CheckCircle2} tone="green" value={report.imported} hint="rows added" />
                <StatCard index={1} label="Failed" icon={XCircle} tone="red" value={report.failed} hint="rolled back" />
                <StatCard index={2} label="Invalid" icon={AlertTriangle} tone="amber" value={report.invalid} hint="not imported" />
                <StatCard index={3} label="Duplicates" icon={Copy} tone="slate" value={report.duplicates} hint="left unchanged" />
              </>
            ) : (
              <>
                <StatCard index={0} label="Total rows" icon={ListChecks} tone="slate" value={report.total} />
                <StatCard index={1} label="Ready to import" icon={CheckCircle2} tone="green" value={report.valid} />
                <StatCard index={2} label="Invalid" icon={XCircle} tone="red" value={report.invalid} />
                <StatCard index={3} label="Duplicates" icon={Copy} tone="amber" value={report.duplicates} hint="already exist or repeated" />
              </>
            )}
          </StatGrid>

          <Card>
            <CardHeader
              title={imported ? '3. Results' : '3. Preview'}
              subtitle={imported
                ? 'Each course was saved in its own transaction; a failed course left nothing behind.'
                : 'Fix invalid rows in your file and upload it again, or import only the rows that are ready.'}
              action={(
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => download(reportCsv(report.rows), `course-import-${imported ? 'results' : 'preview'}.csv`)}>
                    <Download className="size-4" /> Download report
                  </Button>
                  {!imported && (
                    <Button size="sm" disabled={!report.valid} loading={run.isPending} onClick={commit}>
                      Import {report.valid} ready row{report.valid === 1 ? '' : 's'}
                    </Button>
                  )}
                  {imported && <Button size="sm" variant="secondary" onClick={reset}>Import another file</Button>}
                </div>
              )}
            />
            <Tabs
              className="px-5 pt-4"
              items={tabs.map(([value, label]) => ({ value, label }))}
              value={filter}
              onChange={(value) => { setFilter(value); setPage(1) }}
            />
            <DataTable
              rows={paged}
              rowKey={(r) => r.index}
              empty="No rows here"
              meta={{ page, totalPages: Math.ceil(shown.length / PAGE_SIZE), total: shown.length }}
              onPage={setPage}
              columns={[
                { key: 'line', header: 'Line', className: 'w-16 text-slate-500' },
                { key: 'courseCode', header: 'Course', render: (r) => <span className="font-medium">{r.courseCode || '—'}</span> },
                { key: 'programme', header: 'Programme', render: (r) => r.programme || '—' },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge> },
                {
                  key: 'errors', header: 'Details', render: (r) => (r.errors.length
                    ? <ul className="list-disc space-y-0.5 pl-4 text-slate-700">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                    : <span className="text-slate-400">—</span>),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  )
}
