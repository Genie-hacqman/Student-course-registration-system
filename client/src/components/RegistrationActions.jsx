import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal } from './ui'
import { useAddCourse, useJoinWaitlist } from '../api/student'

const RULE_TITLES = {
  PREREQUISITE: 'Prerequisite not satisfied',
  COREQUISITE: 'Corequisite missing',
  TIMETABLE_CONFLICT: 'Timetable conflict',
  CAPACITY: 'Section is full',
  CREDIT_LIMIT: 'Credit limit exceeded',
  MINIMUM_CREDITS: 'Not enough credits',
  REGISTRATION_WINDOW: 'Registration is closed',
  PROGRAM_ELIGIBILITY: 'Not on your curriculum',
  LEVEL_ELIGIBILITY: 'Course level too high',
  DUPLICATE_COURSE: 'Already registered',
  STUDENT_ELIGIBILITY: 'Account not eligible',
  SECTION_AVAILABILITY: 'Section unavailable',
}

export const ruleTitle = (rule) => RULE_TITLES[rule] ?? 'Not allowed'

export function RuleList({ failures }) {
  return (
    <ul className="space-y-3">
      {failures.map((f, i) => (
        <li key={`${f.rule}-${i}`} className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-slate-800">{ruleTitle(f.rule)}</p>
            <p className="text-sm text-slate-600">{f.message}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function useRegistrationActions() {
  const add = useAddCourse()
  const join = useJoinWaitlist()
  const [failures, setFailures] = useState(null)

  const handleError = (err) => {
    if (err.code === 'REGISTRATION_RULES_FAILED' && Array.isArray(err.details)) setFailures(err.details)
    else toast.error(err.message)
  }

  const addSection = (sectionId) =>
    add.mutate(sectionId, {
      onSuccess: ({ confirmation }) => {
        toast.success(confirmation.message, {
          description: `${confirmation.totalCredits} / ${confirmation.maxCredits} credits · ${confirmation.seatsRemaining} seats left`,
        })
        confirmation.warnings?.forEach((w) => toast.warning(w))
      },
      onError: handleError,
    })

  const joinWaitlist = (sectionId) =>
    join.mutate(sectionId, {
      onSuccess: (entry) => toast.success(`Added to the waitlist${entry?.position ? ` (position ${entry.position})` : ''}.`, {
        description: "You'll be notified when a seat opens. The seat is not held for you — register quickly.",
      }),
      onError: handleError,
    })

  const pendingId = add.isPending ? add.variables : join.isPending ? join.variables : null

  const dialog = (
    <Modal
      open={Boolean(failures)}
      onClose={() => setFailures(null)}
      title={failures?.length === 1 ? ruleTitle(failures[0].rule) : "You can't add this course yet"}
      footer={<Button variant="secondary" onClick={() => setFailures(null)}>Close</Button>}
    >
      {failures && <RuleList failures={failures} />}
    </Modal>
  )

  return { addSection, joinWaitlist, pendingId, dialog }
}

export function SatisfiedLine({ children }) {
  return (
    <p className="flex items-center gap-2 text-sm text-green-700">
      <CheckCircle2 className="size-4" /> {children}
    </p>
  )
}
