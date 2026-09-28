import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { http, useApiMutation } from '../../api/admin'
import { Button, Modal } from '../ui'
import { StudentPicker } from './Pickers'
import { Checkbox, Textarea } from './FormModal'
import { ruleTitle } from '../RegistrationActions'

const WHY_NOT = {
  CAPACITY: 'The section is full. Raise its capacity on the section page, then try again.',
  DUPLICATE_COURSE: 'The student already has a section of this course.',
  SECTION_AVAILABILITY: 'This section is not open for registration (closed, cancelled or not in the current semester).',
  STUDENT_ELIGIBILITY: 'The student cannot register right now (suspended, graduated or on academic hold). Fix that on their account first.',
}

/**
 * Staff adds a student to a section. The server runs the normal checks (except the registration period);
 * if some fail and all of them may be overridden, staff can override them with a reason.
 */
export function AddStudentDialog({ open, onClose, sectionId, sectionLabel }) {
  const [studentId, setStudentId] = useState()
  const [failures, setFailures] = useState(null)
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const add = useApiMutation((body) => http.post(`/admin/sections/${sectionId}/students`, body))

  const close = () => {
    setStudentId(undefined)
    setFailures(null)
    setOverride(false)
    setReason('')
    onClose()
  }

  const canOverride = failures?.length > 0 && failures.every((f) => f.overridable)
  const reasonOk = reason.trim().length >= 5

  const submit = async () => {
    try {
      const res = await add.mutateAsync({ studentId, ...(override ? { override: true, reason: reason.trim() } : {}) })
      toast.success(res.confirmation.overridden?.length
        ? `Added, overriding: ${res.confirmation.overridden.map(ruleTitle).join(', ')}`
        : 'Student added — they have been notified')
      close()
    } catch (err) {
      if (err.code === 'REGISTRATION_RULES_FAILED' && Array.isArray(err.details)) setFailures(err.details)
      else toast.error(err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Add a student to ${sectionLabel}`}
      footer={(
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            loading={add.isPending}
            disabled={!studentId || (failures && !canOverride) || (override && !reasonOk) || (canOverride && !override)}
            onClick={submit}
          >
            {override ? 'Override and add' : 'Add student'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <StudentPicker label="Student" value={studentId} onChange={(id) => { setStudentId(id); setFailures(null); setOverride(false) }} />
        <p className="text-xs text-slate-500">The usual registration checks apply, except the registration period. The student is notified.</p>
        {failures && (
          <div className="space-y-3 rounded-lg bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">The student doesn't meet these checks:</p>
            <ul className="space-y-2">
              {failures.map((f) => (
                <li key={f.rule} className="flex gap-2 text-sm">
                  {f.overridable ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" />}
                  <span>
                    <span className="font-medium">{ruleTitle(f.rule)}:</span> {f.message}
                    {!f.overridable && <span className="block text-red-700">{WHY_NOT[f.rule] ?? "This check can't be overridden."}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {canOverride && (
              <>
                <Checkbox label="Override these checks" hint="Recorded with your name and reason, and honoured when the student submits." checked={override} onChange={(e) => setOverride(e.target.checked)} />
                {override && (
                  <Textarea
                    label="Reason"
                    placeholder="e.g. Equivalent course completed at a previous university"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    error={reason && !reasonOk ? 'At least 5 characters' : undefined}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Staff removes a student from a section; a reason is required and sent to the student. */
export function RemoveStudentDialog({ student, onClose, sectionId, sectionLabel }) {
  const [reason, setReason] = useState('')
  const remove = useApiMutation(() => http.delete(`/admin/sections/${sectionId}/students/${student.id}`, { reason: reason.trim() }), {
    success: 'Student removed — they have been notified',
  })
  const close = () => {
    setReason('')
    onClose()
  }
  return (
    <Modal
      open={Boolean(student)}
      onClose={close}
      title={`Remove from ${sectionLabel}?`}
      footer={(
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            disabled={reason.trim().length < 5}
            onClick={() => remove.mutate(undefined, { onSuccess: close, onError: (err) => toast.error(err.message) })}
          >
            Remove student
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {student?.name} loses their seat, and the next student on the waitlist is told a seat opened. Their registration status doesn't change.
        </p>
        <Textarea label="Reason (sent to the student)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}
