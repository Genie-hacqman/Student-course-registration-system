import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Download, FileUp, FlaskConical, KeyRound, Mail, Square, Upload,
} from 'lucide-react'
import { http } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { can, PERMS } from '../../lib/roles'
import { parseCsv, toCsv } from '../../lib/csv'
import {
  IMPORT_STEPS, prepare, templateRows, batches, mergeReports, rowFieldFromPath, endpointFor, batchSizeFor,
  credentialsCsvRows, CREDENTIAL_COLUMNS,
} from '../../lib/imports'
import {
  Badge, Button, Card, CardHeader, PageHeader, ProgressBar, Select, cx, userMessage,
} from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import ClashList from '../../components/admin/ClashList'

const INVITES = 'invites'
const EMPTY = { text: '', fileName: '', sendInvites: false, report: null, error: null, checkedText: null }

const downloadTemplate = (step) => {
  const { headers, rows } = templateRows(step)
  const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${step.key}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export default function DataImport() {
  const { user } = useAuth()
  const steps = IMPORT_STEPS.filter((s) => can(user, s.permission))
  const canInvite = can(user, PERMS.USER_MANAGE)
  const [active, setActive] = useState(steps[0]?.key ?? INVITES)
  // Kept per step, so switching steps never loses a loaded file or its report.
  const [states, setStates] = useState({})
  const stateFor = (key) => states[key] ?? EMPTY

  // Admission PINs exist only in this page's memory until downloaded: warn before they're lost.
  const unsaved = Object.values(states).some((s) => s.report?.credentials?.length && !s.report.credentialsSaved)
  useEffect(() => {
    if (!unsaved) return undefined
    const warn = (e) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  const update = (key) => (patch) => setStates((s) => ({ ...s, [key]: { ...(s[key] ?? EMPTY), ...patch } }))

  const nav = [...steps.map((s, i) => ({ key: s.key, label: `${i + 1}. ${s.label}` })), ...(canInvite ? [{ key: INVITES, label: 'Send invites' }] : [])]
  const step = steps.find((s) => s.key === active)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import data"
        subtitle="Load your institution's real departments, programmes, courses, people and course offerings from CSV files."
      />
      <Card className="p-5 text-sm text-slate-600">
        Work through the steps <strong>in order</strong>: each file can only refer to records loaded by the steps above it.
        Create the academic year and current semester first in <Link to="/staff/semesters" className="font-medium text-brand-700 hover:underline">Semesters</Link>.
        Every import can be <strong>checked first</strong> without saving anything, and re-importing a corrected file updates records instead of duplicating them.
      </Card>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Import steps" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {nav.map((n) => {
            const report = states[n.key]?.report
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setActive(n.key)}
                aria-current={active === n.key ? 'step' : undefined}
                className={cx(
                  'flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                  active === n.key ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <span>{n.label}</span>
                {report && !report.dryRun && (
                  report.failed ? <AlertTriangle className="size-4 text-amber-600" aria-label="Imported with errors" />
                    : <CheckCircle2 className="size-4 text-green-600" aria-label="Imported" />
                )}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0">
          {active === INVITES
            ? <InvitesPanel />
            : step && <StepPanel key={step.key} step={step} state={stateFor(step.key)} update={update(step.key)} />}
        </div>
      </div>
    </div>
  )
}

function StepPanel({ step, state, update }) {
  const qc = useQueryClient()
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(null) // 'check' | 'import'

  const parsed = useMemo(() => (state.text.trim() ? prepare(step, parseCsv(state.text)) : null), [step, state.text])
  const ready = parsed && !parsed.headers.missing.length ? parsed.rows.filter((r) => !r.problems.length) : []
  const withProblems = parsed ? parsed.rows.length - ready.length : 0

  const setText = (text, fileName = '') => update({ text, fileName, report: null, error: null })

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text(), file.name)
    e.target.value = ''
  }

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    update({ report: null, error: null })
    const lines = ready.map((r) => r.line)
    const sentRows = ready.map((r) => r.row)
    const size = batchSizeFor(step)
    const reports = []
    const report = () => ({ ...mergeReports(reports, size), lines, sentRows })
    try {
      for (const [i, batch] of batches(sentRows, size).entries()) {
        try {
          reports.push(await http.post(endpointFor(step), {
            rows: batch, dryRun, ...(step.invites ? { sendInvites: state.sendInvites } : {}),
          }))
        } catch (err) {
          err.offset = i * size
          throw err
        }
      }
      update({ report: report(), checkedText: dryRun ? state.text : state.checkedText })
    } catch (err) {
      // Earlier batches may already have been saved; show what was (including any credentials), alongside the error.
      update({ error: { err, lines }, report: reports.length ? report() : null })
    } finally {
      setBusy(null)
      if (!dryRun && reports.length) qc.invalidateQueries()
    }
  }

  const checked = state.checkedText === state.text && state.text !== ''
  const optional = step.columns.filter((c) => !c.required)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={step.label}
          subtitle={step.description}
          action={<Button variant="secondary" size="sm" onClick={() => downloadTemplate(step)}><Download className="size-4" /> Template</Button>}
        />
        <div className="space-y-4 px-5 py-4">
          <div className="text-sm">
            <p className="text-slate-500">Required columns</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {step.columns.filter((c) => c.required).map((c) => <ColumnChip key={c.name} column={c} required />)}
            </div>
            {optional.length > 0 && (
              <>
                <p className="mt-3 text-slate-500">Optional columns (leave a cell empty to keep the current value)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {optional.map((c) => <ColumnChip key={c.name} column={c} />)}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}><FileUp className="size-4" /> Choose CSV file</Button>
            {state.fileName && <span className="text-sm text-slate-600">{state.fileName}</span>}
          </div>
          <textarea
            value={state.text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label={`${step.label} CSV`}
            placeholder={`…or paste CSV here, starting with the header row:\n${step.columns.map((c) => c.name).join(',')}`}
            className="block w-full rounded-lg border-0 px-3 py-2 font-mono text-xs ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />

          {step.invites && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-slate-300 text-brand-600"
                checked={state.sendInvites}
                onChange={(e) => update({ sendInvites: e.target.checked })}
              />
              <span>
                Email invites as each row imports
                <span className="block text-xs text-slate-500">Leave off to check everything first, then send them from “Send invites”.</span>
              </span>
            </label>
          )}

          {parsed?.headers.missing.length > 0 && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" /> Missing required column{parsed.headers.missing.length > 1 ? 's' : ''}: {parsed.headers.missing.join(', ')}
            </p>
          )}
          {parsed?.headers.unknown.length > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="size-4 shrink-0" /> Ignoring unknown column{parsed.headers.unknown.length > 1 ? 's' : ''}: {parsed.headers.unknown.join(', ')}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500">
              {parsed ? `${parsed.rows.length} rows · ${ready.length} ready${withProblems ? ` · ${withProblems} with problems (skipped)` : ''}` : 'No file loaded'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant={checked ? 'secondary' : 'primary'} disabled={!ready.length || Boolean(busy)} loading={busy === 'check'} onClick={() => run(true)}>
                <FlaskConical className="size-4" /> Check (dry run)
              </Button>
              <Button variant={checked ? 'primary' : 'secondary'} disabled={!ready.length || Boolean(busy)} loading={busy === 'import'} onClick={() => run(false)}>
                <Upload className="size-4" /> Import {ready.length || ''}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {state.error && <RequestError {...state.error} />}
      {state.report && <Report report={state.report} onCredentialsSaved={() => update({ report: { ...state.report, credentialsSaved: true } })} />}

      {parsed?.rows.length > 0 && !state.report && (
        <Card>
          <CardHeader title="Preview" subtitle="Rows with problems are skipped. Fix them in the file and load it again." />
          <DataTable
            rows={parsed.rows}
            rowKey={(r) => r.line}
            columns={[
              { key: 'line', header: 'Line' },
              ...step.columns.slice(0, 4).map((c) => ({
                key: c.name,
                header: c.name,
                render: (r) => format(r.row[c.name]),
              })),
              {
                key: 'problems',
                header: '',
                render: (r) => (r.problems.length
                  ? <span className="text-xs text-red-600">{r.problems.join('; ')}</span>
                  : <Badge tone="green">Ready</Badge>),
              },
            ]}
          />
        </Card>
      )}
    </div>
  )
}

const format = (v) => {
  if (v == null) return <span className="text-slate-400">—</span>
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? `${x.day} ${x.startTime}-${x.endTime}${x.room ? ` ${x.room}` : ''}` : x)).join(v[0] && typeof v[0] === 'object' ? '; ' : ' | ')
  return String(v)
}

function ColumnChip({ column, required }) {
  return (
    <span title={column.hint || undefined} className={cx('rounded-md px-2 py-0.5 font-mono text-xs ring-1 ring-inset', required ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-slate-50 text-slate-700 ring-slate-200')}>
      {column.name}{column.hint && <span className="ml-1 font-sans text-slate-500">· {column.hint}</span>}
    </span>
  )
}

const saveCredentials = (report) => {
  const csv = toCsv(CREDENTIAL_COLUMNS, credentialsCsvRows(report.credentials, report.sentRows, report.lines))
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  Object.assign(document.createElement('a'), { href: url, download: `admission-credentials-${stamp}.csv` }).click()
  URL.revokeObjectURL(url)
}

/** New admissions' one-time PINs: the only copy, so saving them is made hard to miss. */
function CredentialsPanel({ report, onSaved }) {
  return (
    <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="flex items-center gap-2 font-medium"><KeyRound className="size-4" /> {report.credentials.length} new student account{report.credentials.length === 1 ? '' : 's'}</p>
      <p className="mt-1">
        Each has a temporary PIN that is <strong>shown only this once</strong>. Download the file now and use it for the admission letters; keep it private.
        A lost PIN can be replaced later with “Reset PIN” on the student's page.
      </p>
      <Button className="mt-3" onClick={() => { saveCredentials(report); onSaved() }}>
        <Download className="size-4" /> Download credentials (CSV)
      </Button>
      {report.credentialsSaved && <span className="ml-3 text-green-700"><CheckCircle2 className="inline size-4" /> Downloaded</span>}
    </div>
  )
}

function Report({ report, onCredentialsSaved }) {
  const counts = [
    ['created', 'green'], ['updated', 'blue'], ['unchanged', 'slate'], ['failed', 'red'], ...(report.invited ? [['invited', 'blue']] : []),
  ]
  return (
    <Card className="space-y-4 p-5">
      {report.dryRun
        ? <p className="flex items-center gap-2 font-medium text-brand-700"><FlaskConical className="size-5" /> Dry run: nothing was saved. This is what importing would do:</p>
        : <p className="flex items-center gap-2 font-medium text-green-700"><CheckCircle2 className="size-5" /> Import finished</p>}
      <div className="flex flex-wrap gap-2">
        {counts.map(([k, tone]) => <Badge key={k} tone={tone}>{report[k]} {k}</Badge>)}
      </div>
      {report.credentials?.length > 0 && <CredentialsPanel report={report} onSaved={onCredentialsSaved} />}
      {report.errors.length > 0 && (
        <div>
          <p className="flex items-center gap-2 font-medium text-red-700"><AlertTriangle className="size-5" /> {report.errors.length} row{report.errors.length > 1 ? 's' : ''} rejected</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {report.errors.map((e) => (
              <li key={e.row}>
                {Array.isArray(e.details) && e.details.some((d) => d?.day)
                  ? <ClashList error={{ message: `Line ${report.lines[e.row]} (${e.key}): ${e.message}`, details: e.details }} />
                  : <span><span className="font-medium">Line {report.lines[e.row]}</span> <span className="text-slate-500">({e.key})</span>: {e.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

/** A request that failed as a whole: a 422 names rows and fields, anything else gets a plain message. */
function RequestError({ err, lines }) {
  const rowIssues = (Array.isArray(err.details) ? err.details : [])
    .map((d) => ({ ...d, at: rowFieldFromPath(d.field) }))
  return (
    <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> {userMessage(err)}</p>
      {rowIssues.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-6">
          {rowIssues.map((d, i) => (
            <li key={i}>
              {d.at ? `Line ${lines[(err.offset ?? 0) + d.at.index]}${d.at.field ? `, ${d.at.field}` : ''}: ` : ''}{d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InvitesPanel() {
  const [role, setRole] = useState('')
  const [progress, setProgress] = useState(null) // { sent, remaining }
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const stop = useRef(false)

  const send = async (all) => {
    setRunning(true)
    setError(null)
    stop.current = false
    let sent = 0
    try {
      for (;;) {
        const res = await http.post('/admin/import/invites', { ...(role ? { role } : {}), limit: 200 })
        sent += res.sent
        setProgress({ sent, remaining: res.remaining })
        if (!all || res.remaining === 0 || res.sent === 0 || stop.current) break
      }
    } catch (err) {
      setError(err)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Mail}
        title="Send invites"
        subtitle="Imported lecturers and staff have no password until they accept an invite, which links to a page where they choose their own. (Students don't need one: they sign in with the PIN from admission.)"
      />
      <div className="space-y-4 px-5 py-4 text-sm">
        <p className="text-slate-600">
          Only people who haven't set a password yet, and whose last invite has expired or was never sent, are emailed.
          Running this again later is safe.
        </p>
        <Select label="Who" value={role} onChange={(e) => setRole(e.target.value)} className="max-w-xs" disabled={running}>
          <option value="">Everyone waiting</option>
          <option value="LECTURER">Lecturers</option>
        </Select>
        {progress && (
          <div className="space-y-2">
            <ProgressBar value={progress.sent} max={progress.sent + progress.remaining} label="Invites sent" tone={progress.remaining ? 'brand' : 'green'} />
            <p className="text-slate-600">{progress.sent} sent · {progress.remaining} still waiting</p>
          </div>
        )}
        {error && <p role="alert" className="text-red-700">{userMessage(error)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={running} onClick={() => send(false)}>Send next 200</Button>
          <Button disabled={running} onClick={() => send(true)}><Mail className="size-4" /> Send all</Button>
          {running && <Button variant="ghost" onClick={() => { stop.current = true }}><Square className="size-4" /> Stop after this batch</Button>}
        </div>
      </div>
    </Card>
  )
}
