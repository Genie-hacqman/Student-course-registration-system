import { useState } from 'react'
import { ClipboardPen, NotebookPen, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  ASSESSMENT_TYPES, useAssessmentScores, useCreateAssessment, useDeleteAssessment, usePublishAssessment, useSaveScores,
  useSectionAssessments, useUpdateAssessment,
} from '../../api/assessments'
import {
  Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, ProgressBar, Select, SkeletonList, SkeletonTable, StatusBadge, cx,
} from '../ui'
import FormModal, { Textarea } from '../admin/FormModal'
import ConfirmDialog from '../admin/ConfirmDialog'
import { formatDate, formatDateTime } from '../../lib/format'

const toLocalInput = (d) => {
  if (!d) return ''
  const date = new Date(d)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const schema = (remaining) => z.object({
  title: z.string().trim().min(2, 'At least 2 characters').max(150),
  type: z.enum(ASSESSMENT_TYPES),
  maxScore: z.coerce.number({ message: 'Enter a number' }).positive('Must be above 0').max(1000),
  weight: z.coerce.number({ message: 'Enter a number' }).min(0).max(remaining, `At most ${remaining}% is left in this course`),
  dueAt: z.string().optional(),
  description: z.string().trim().max(5000).optional(),
})

function ScoreSheet({ assessment, onClose }) {
  const data = useAssessmentScores(assessment.id)
  const save = useSaveScores()
  const [edits, setEdits] = useState({})
  const students = data.data?.students ?? []
  const value = (s) => (s.studentId in edits ? edits[s.studentId] : s.score ?? '')
  const invalid = students.filter((s) => {
    const v = value(s)
    return v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > assessment.maxScore)
  })
  const changed = students.filter((s) => s.studentId in edits && String(edits[s.studentId]) !== String(s.score ?? ''))

  const submit = () => save.mutate({
    id: assessment.id,
    scores: changed.map((s) => ({ studentId: s.studentId, score: value(s) === '' ? null : Number(value(s)) })),
  }, {
    onSuccess: () => { toast.success('Scores saved'); setEdits({}) },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Scores · ${assessment.title}`}
      description={`Out of ${assessment.maxScore} · ${assessment.weight}% of the course`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button loading={save.isPending} disabled={!changed.length || invalid.length > 0} onClick={submit}>
            Save {changed.length ? `${changed.length} score${changed.length === 1 ? '' : 's'}` : 'scores'}
          </Button>
        </>
      )}
    >
      {data.isPending ? <SkeletonList rows={4} /> : data.isError ? <ErrorState error={data.error} onRetry={() => data.refetch()} /> : students.length ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Scores for {assessment.title}</caption>
          <thead className="text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr><th scope="col" className="pb-2 font-medium">Student</th><th scope="col" className="w-32 pb-2 font-medium">Score</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => {
              const bad = invalid.includes(s)
              const dirty = s.studentId in edits && String(edits[s.studentId]) !== String(s.score ?? '')
              return (
                <tr key={s.studentId}>
                  <td className="py-2 pr-3"><span className="font-medium">{s.name}</span> <span className="text-xs text-slate-500">{s.studentNumber}</span></td>
                  <td className="py-2">
                    <label className="sr-only" htmlFor={`score-${s.studentId}`}>Score for {s.name}</label>
                    <input
                      id={`score-${s.studentId}`}
                      inputMode="decimal"
                      value={value(s)}
                      onChange={(e) => setEdits((m) => ({ ...m, [s.studentId]: e.target.value }))}
                      aria-invalid={bad}
                      placeholder="—"
                      className={cx(
                        'w-24 rounded-md border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset focus:ring-2 focus:outline-none',
                        bad ? 'ring-red-500 focus:ring-red-600' : dirty ? 'ring-brand-500 focus:ring-brand-600' : 'ring-slate-300 focus:ring-brand-500',
                      )}
                    />
                    <span className="ml-1 text-xs text-slate-400">/ {assessment.maxScore}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <EmptyState compact title="No students registered yet" />}
      {invalid.length > 0 && <p role="alert" className="mt-3 text-sm text-red-700">Scores must be between 0 and {assessment.maxScore}.</p>}
    </Modal>
  )
}

export function AssessmentsPanel({ section }) {
  const list = useSectionAssessments(section.id)
  const create = useCreateAssessment()
  const update = useUpdateAssessment()
  const remove = useDeleteAssessment()
  const publish = usePublishAssessment()
  const [editing, setEditing] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [publishing, setPublishing] = useState(null)

  if (list.isPending) return <Card><SkeletonTable rows={4} cols={5} /></Card>
  if (list.isError) return <Card><ErrorState title="Unable to load assessments" error={list.error} onRetry={() => list.refetch()} /></Card>
  const { assessments, totalWeight } = list.data
  const remainingFor = (a) => 100 - totalWeight + (a?.weight ?? 0)

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Weight allocated</p>
            <p className="text-2xl font-semibold tabular-nums">{totalWeight}% <span className="text-sm font-normal text-slate-500">of 100%</span></p>
          </div>
          <Button onClick={() => setEditing({})}><Plus className="size-4" aria-hidden /> New assessment</Button>
        </div>
        <div className="mt-3"><ProgressBar value={totalWeight} max={100} tone={totalWeight > 100 ? 'red' : 'brand'} label="Assessment weight allocated" /></div>
      </Card>

      <Card>
        <CardHeader title="Assessments" subtitle="Drafts are only visible to you until published." icon={NotebookPen} />
        {assessments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Assessment</th>
                  <th scope="col" className="py-3 font-medium">Due</th>
                  <th scope="col" className="py-3 font-medium">Weight</th>
                  <th scope="col" className="py-3 font-medium">Graded</th>
                  <th scope="col" className="py-3 font-medium">Average</th>
                  <th scope="col" className="py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assessments.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500 capitalize">{a.type} · out of {a.maxScore}</p>
                    </td>
                    <td className="py-3 text-slate-600">{a.dueAt ? formatDate(a.dueAt) : '—'}</td>
                    <td className="py-3 tabular-nums">{a.weight}%</td>
                    <td className="py-3 tabular-nums">{a.graded} / {a.rosterSize}</td>
                    <td className="py-3 tabular-nums">{a.averagePercent === null ? '—' : `${a.averagePercent}%`}</td>
                    <td className="py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setScoring(a)}><ClipboardPen className="size-4" aria-hidden /> Scores</Button>
                        {a.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => setPublishing(a)}><Send className="size-4" aria-hidden /> Publish</Button>}
                        <Button size="sm" variant="ghost" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}><Trash2 className="size-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No assessments yet" icon={NotebookPen} action={<Button size="sm" onClick={() => setEditing({})}>Create the first one</Button>}>
            Add quizzes, assignments and exams, then enter scores and publish them to students.
          </EmptyState>
        )}
      </Card>

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.title}` : 'New assessment'}
        schema={schema(remainingFor(editing))}
        wide
        defaultValues={{
          title: editing?.title ?? '', type: editing?.type ?? 'assignment', maxScore: editing?.maxScore ?? 100,
          weight: editing?.weight ?? Math.min(10, remainingFor(editing)), dueAt: toLocalInput(editing?.dueAt), description: editing?.description ?? '',
        }}
        onSubmit={async (v) => {
          const body = { ...v, dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null, description: v.description || null }
          if (editing.id) await update.mutateAsync({ id: editing.id, ...body })
          else await create.mutateAsync({ sectionId: section.id, ...body })
          toast.success(editing.id ? 'Assessment updated' : 'Assessment created as a draft')
        }}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Input label="Title" {...register('title')} error={errors.title?.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Type" {...register('type')}>
                {ASSESSMENT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t[0].toUpperCase() + t.slice(1)}</option>)}
              </Select>
              <Input label="Due" type="datetime-local" {...register('dueAt')} />
              <Input label="Maximum score" type="number" step="0.5" min="0" {...register('maxScore')} error={errors.maxScore?.message} />
              <Input label="Weight (%)" type="number" step="0.5" min="0" {...register('weight')} error={errors.weight?.message} hint={`${remainingFor(editing)}% available`} />
            </div>
            <Textarea label="Instructions (optional)" rows={4} {...register('description')} error={errors.description?.message} />
          </>
        )}
      </FormModal>

      {scoring && <ScoreSheet assessment={scoring} onClose={() => setScoring(null)} />}

      <ConfirmDialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        title={`Publish “${publishing?.title}”?`}
        confirmLabel="Publish"
        danger={false}
        onConfirm={async () => { await publish.mutateAsync(publishing.id); toast.success('Published — students have been notified') }}
      >
        <p>Students in this course will see it{publishing?.dueAt ? `, due ${formatDateTime(publishing.dueAt)},` : ''} along with any scores you’ve entered, and get a notification.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        confirmLabel="Delete"
        onConfirm={async () => { await remove.mutateAsync(deleting.id); toast.success('Assessment deleted') }}
      >
        <p>Every score entered for it will be deleted too.{deleting?.status === 'published' && ' Students will no longer see it.'}</p>
      </ConfirmDialog>
    </div>
  )
}
