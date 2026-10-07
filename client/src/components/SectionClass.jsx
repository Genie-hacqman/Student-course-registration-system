import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, Tabs } from './ui'
import { AddStudentDialog, RemoveStudentDialog } from './admin/StaffEnrolment'
import GradeSheet from './GradeSheet'
import { REGISTRATION_STATUS, formatDate, fullName } from '../lib/format'
import { can } from '../lib/roles'

export default function SectionClass({ backTo, backLabel }) {
  const { id } = useParams()
  const { user } = useAuth()
  const roster = useQuery({ queryKey: ['roster', id], queryFn: () => api.get(`/lecturers/sections/${id}/roster`).then(unwrap) })
  const canGrade = can(user, 'grade:enter') || can(user, 'grade:manage')
  const [tab, setTab] = useState('roster')
  const canEnrol = can(user, 'registration:manage')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)

  if (roster.isPending) return <Loading />
  if (roster.isError) return <ErrorState error={roster.error} onRetry={() => roster.refetch()} />
  const { section, students } = roster.data
  const approved = students.filter((s) => s.registrationStatus === 'approved').length
  const label = `${section.course.code} section ${section.sectionCode}`

  return (
    <div className="space-y-6">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <Card className="p-6">
        <p className="text-sm font-semibold text-brand-700">{section.course.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{section.course.title} · Section {section.sectionCode}</h1>
        <p className="mt-1 text-sm text-slate-500">{students.length} registered · {approved} approved · capacity {section.capacity}</p>
      </Card>

      {canGrade && (
        <Tabs
          items={[{ value: 'roster', label: 'Class list' }, { value: 'grades', label: 'Grades' }]}
          value={tab}
          onChange={setTab}
        />
      )}

      {tab === 'grades' && canGrade ? <GradeSheet sectionId={id} /> : (
        <Card>
          <CardHeader
            title="Class list"
            subtitle="Students whose registration is still awaiting approval are included; only approved students can be graded."
            action={(
              <div className="flex items-center gap-3">
                {students.length > 0 && (
                  <a href={`mailto:?bcc=${students.map((s) => s.user?.email).filter(Boolean).join(',')}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                    <Mail className="size-4" /> Email class
                  </a>
                )}
                {canEnrol && <Button size="sm" onClick={() => setAdding(true)}><UserPlus className="size-4" /> Add student</Button>}
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
                    <th className="py-3 font-medium">Level</th>
                    <th className="py-3 font-medium">Registered</th>
                    <th className="px-5 py-3 font-medium">Registration</th>
                    {canEnrol && <th />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const status = REGISTRATION_STATUS[s.registrationStatus]
                    return (
                      <tr key={s.id}>
                        <td className="px-5 py-2.5"><span className="font-medium">{fullName(s.user)}</span><p className="text-xs text-slate-500">{s.user?.email}</p></td>
                        <td className="py-2.5 tabular-nums">{s.studentNumber}</td>
                        <td className="py-2.5">{s.level}</td>
                        <td className="py-2.5 text-slate-600">{formatDate(s.registeredAt)}</td>
                        <td className="px-5 py-2.5">{status && <Badge tone={status.tone}>{status.label}</Badge>}</td>
                        {canEnrol && (
                          <td className="pr-5 text-right">
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRemoving({ id: s.id, name: fullName(s.user) })}>Remove</Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No students yet" />}
        </Card>
      )}
      {canEnrol && (
        <>
          <AddStudentDialog open={adding} onClose={() => setAdding(false)} sectionId={section.id} sectionLabel={label} />
          <RemoveStudentDialog student={removing} onClose={() => setRemoving(null)} sectionId={section.id} sectionLabel={label} />
        </>
      )}
    </div>
  )
}
