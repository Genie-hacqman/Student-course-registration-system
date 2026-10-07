import { useState } from 'react'
import { AlertTriangle, Check, Copy, Printer } from 'lucide-react'
import { Button, Modal } from '../ui'

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const printSlip = ({ name, studentNumber, schoolEmail, pin }) => {
  const w = window.open('', '_blank', 'width=520,height=640')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Student account — ${escape(studentNumber)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#0f172a;margin:32px}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#475569}
dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;border:1px solid #cbd5e1;border-radius:8px;padding:16px}
dt{color:#64748b}dd{margin:0;font-weight:600;font-family:ui-monospace,monospace}small{display:block;margin-top:16px;color:#64748b}</style>
</head><body><h1>Student portal account</h1><p>${escape(name ?? '')}</p><dl>
<dt>Student ID</dt><dd>${escape(studentNumber)}</dd><dt>School email</dt><dd>${escape(schoolEmail)}</dd><dt>Temporary PIN</dt><dd>${escape(pin)}</dd></dl>
<small>Sign in with your Student ID and this PIN. You will be asked to choose a new PIN straight away. Keep this slip private.</small>
</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

function CopyRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={mono ? 'truncate font-mono text-base font-semibold tracking-wider' : 'truncate font-medium'}>{value}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

export default function CredentialsDialog({ open, onClose, credentials, name, title = 'Student account created', action }) {
  if (!credentials) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={name}
      footer={(
        <>
          <Button variant="secondary" onClick={() => printSlip({ ...credentials, name })}><Printer className="size-4" /> Print slip</Button>
          {action}
          <Button onClick={onClose}>Done</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <CopyRow label="Student ID" value={credentials.studentNumber} mono />
        <CopyRow label="School email" value={credentials.schoolEmail} />
        <CopyRow label="Temporary PIN" value={credentials.pin} mono />
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This PIN is shown only once. Give it to the student through the admission process; they must change it when they first sign in.
        </p>
      </div>
    </Modal>
  )
}
