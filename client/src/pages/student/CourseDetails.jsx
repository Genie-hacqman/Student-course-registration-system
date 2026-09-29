import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useAvailableCourses, useCourse, useMyWaitlists, usePrerequisiteCheck } from '../../api/student'
import { Badge, Card, CardHeader, ErrorState, Loading } from '../../components/ui'
import { SectionActionButton, SectionRow } from '../../components/SectionCard'
import { useRegistrationActions } from '../../components/RegistrationActions'
import { useSectionRooms } from '../../lib/socket'

/** Groups requirement rows: rows sharing a non-null groupNo are alternatives; a null groupNo is its own group. */
const groupRequirements = (rows) => {
  const groups = new Map()
  rows.forEach((row, i) => {
    const key = row.through.groupNo ?? `solo-${i}`
    if (!groups.has(key)) groups.set(key, { minGrade: row.through.minGrade, courses: [] })
    groups.get(key).courses.push(row)
  })
  return [...groups.values()]
}

function RequirementGroups({ groups, missingIds }) {
  return (
    <ul className="space-y-2">
      {groups.map((g) => {
        const met = g.courses.every((c) => !missingIds.has(c.id))
        return (
          <li key={g.courses.map((c) => c.id).join('-')} className="flex items-start gap-2 text-sm">
            {met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
            <span>
              {g.courses.length > 1 && <span className="text-slate-500">One of: </span>}
              {g.courses.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && <span className="text-slate-400"> or </span>}
                  <Link to={`/student/courses/${c.id}`} className="font-medium text-slate-800 hover:text-brand-700">{c.code}</Link>
                  <span className="text-slate-500"> {c.title}</span>
                </span>
              ))}
              {g.minGrade && <span className="text-slate-500"> (minimum grade {g.minGrade})</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function PrerequisitePanel({ course, check }) {
  const rows = (course.prerequisites ?? []).map((p) => ({ ...p, through: p.CoursePrerequisite ?? p.coursePrerequisite ?? {} }))
  const prereqs = groupRequirements(rows.filter((r) => r.through.type !== 'corequisite'))
  const coreqs = groupRequirements(rows.filter((r) => r.through.type === 'corequisite'))
  const missingIds = new Set([...(check?.missing ?? []), ...(check?.corequisites ?? []).flatMap((g) => g.anyOf)].map((c) => c.id))

  return (
    <Card>
      <CardHeader title="Prerequisites" />
      <div className="space-y-4 px-5 py-4">
        {!prereqs.length && <p className="text-sm text-slate-500">This course has no prerequisites.</p>}
        {prereqs.length > 0 && check && (check.qualified ? (
          <div className="flex items-start gap-3 rounded-lg bg-green-50 p-3">
            {check.overridden ? <ShieldCheck className="size-5 text-green-600" /> : <CheckCircle2 className="size-5 text-green-600" />}
            <div className="text-sm">
              <p className="font-medium text-green-800">Prerequisite satisfied</p>
              <p className="text-green-700">
                {check.overridden ? 'The registry has waived the requirement for you.' : 'You have completed the required course(s).'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
            <AlertTriangle className="size-5 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">Prerequisite not satisfied</p>
              <p className="text-amber-800">
                You must complete {check.groups.map((g) => g.description).join(' and ')} before registering for {course.code}.
              </p>
            </div>
          </div>
        ))}
        {prereqs.length > 0 && <RequirementGroups groups={prereqs} missingIds={missingIds} />}
        {coreqs.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium">Corequisites <span className="font-normal text-slate-500">— take in the same semester (checked when you submit)</span></p>
            <RequirementGroups groups={coreqs} missingIds={missingIds} />
          </div>
        )}
      </div>
    </Card>
  )
}

export default function CourseDetails() {
  const { id } = useParams()
  const course = useCourse(id)
  const check = usePrerequisiteCheck(id)
  const available = useAvailableCourses()
  const waitlists = useMyWaitlists()
  const { addSection, joinWaitlist, pendingId, dialog } = useRegistrationActions()

  // Status and seats come from available-courses (same rules as the add endpoint); course detail supplies the rest.
  const offered = available.data?.courses.find((c) => String(c.id) === String(id))
  const waitlisted = useMemo(() => new Set((waitlists.data ?? []).map((w) => w.courseSectionId)), [waitlists.data])
  const sections = useMemo(() => {
    const current = (course.data?.sections ?? []).filter((s) => s.semester?.isCurrent)
    return current.map((s) => ({ ...s, ...(offered?.sections.find((o) => o.id === s.id) ?? {}) }))
  }, [course.data, offered])
  useSectionRooms(sections.map((s) => s.id))

  if (course.isPending) return <Loading />
  if (course.isError) return <ErrorState error={course.error} onRetry={() => course.refetch()} />
  const c = course.data

  return (
    <div className="space-y-6">
      <Link to="/student/courses" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Back to catalog
      </Link>

      <Card className="p-6">
        <p className="text-sm font-semibold text-brand-700">{c.code}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{c.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="blue">{c.credits} credits</Badge>
          <Badge>Level {c.level}</Badge>
          {c.department && <Badge>{c.department.name}</Badge>}
          {offered && <Badge tone="slate"><span className="capitalize">{offered.type}</span></Badge>}
        </div>
        <h2 className="mt-6 text-sm font-semibold">Course description</h2>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-600">{c.description || 'No description provided.'}</p>
      </Card>

      <PrerequisitePanel course={c} check={check.data} />

      <Card>
        <CardHeader title="Sections this semester" subtitle={available.data?.semester.name} />
        <div className="space-y-3 px-5 py-4">
          {!offered && available.isSuccess && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              This course isn't on your program's curriculum, so you can't register for it.
            </p>
          )}
          {sections.length ? sections.map((s) => (
            <SectionRow
              key={s.id}
              section={s}
              actions={(sec) => (
                <SectionActionButton section={sec} onAdd={addSection} onWaitlist={joinWaitlist} pendingId={pendingId} onWaitlistIds={waitlisted} />
              )}
            />
          )) : <p className="text-sm text-slate-500">No sections are offered this semester.</p>}
        </div>
      </Card>
      {dialog}
    </div>
  )
}
