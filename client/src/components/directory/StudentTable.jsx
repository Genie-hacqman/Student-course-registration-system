import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, QueryState } from '../ui'
import DataTable from '../admin/DataTable'
import { REGISTRATION_STATUS, fullName } from '../../lib/format'

export const STUDENT_TONE = { active: 'green', probation: 'amber', suspended: 'red', graduated: 'slate' }

export function RegistrationBadge({ status }) {
  if (!status) return <Badge tone="slate">Not registered</Badge>
  const meta = REGISTRATION_STATUS[status] ?? { label: status, tone: 'slate' }
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

function Admission({ admission }) {
  if (!admission) return '—'
  return (
    <div className="leading-tight">
      <p>{admission.source === 'online' ? <span className="tabular-nums">{admission.applicationNumber}</span> : 'Staff admission'}</p>
      {admission.session && <p className="text-xs text-slate-500">{admission.session}</p>}
    </div>
  )
}

export default function StudentTable({ query, onPage, showDepartment = true, showProgram = true, empty = 'No students match', emptyHint }) {
  const navigate = useNavigate()
  return (
    <QueryState query={query} loadingLabel="Loading students…">
      {({ items, meta }) => (
        <DataTable
          rows={items}
          meta={meta}
          onPage={onPage}
          empty={empty}
          emptyHint={emptyHint}
          onRowClick={(s) => navigate(`/staff/students/${s.id}`)}
          columns={[
            {
              key: 'name', header: 'Name', render: (s) => (
                <div className="flex items-center gap-3">
                  <Avatar user={s.user} thumb size="md" />
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(s.user)}</p>
                    <p className="truncate text-xs text-slate-500">{s.user?.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'studentNumber', header: 'Student ID', render: (s) => <span className="tabular-nums">{s.studentNumber}</span> },
            ...(showProgram ? [{
              key: 'program', header: 'Programme', render: (s) => (
                <div className="leading-tight"><p>{s.program?.name}</p><p className="text-xs text-slate-500">{s.program?.code}</p></div>
              ),
            }] : []),
            ...(showDepartment ? [{ key: 'department', header: 'Department', render: (s) => <span title={s.program?.department?.name}>{s.program?.department?.code ?? '—'}</span> }] : []),
            { key: 'level', header: 'Level', render: (s) => <span className="tabular-nums">{s.level}</span> },
            { key: 'admission', header: 'Admission', render: (s) => <Admission admission={s.admission} /> },
            { key: 'registration', header: 'Registration', render: (s) => <RegistrationBadge status={s.registration?.status} /> },
            { key: 'status', header: 'Status', render: (s) => <Badge tone={STUDENT_TONE[s.status]}>{s.status}</Badge> },
          ]}
        />
      )}
    </QueryState>
  )
}
