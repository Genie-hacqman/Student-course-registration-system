import { useState } from 'react'
import { Megaphone, Pencil, Pin, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import {
  AUDIENCES, useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useMyAnnouncements, useUpdateAnnouncement,
} from '../api/announcements'
import { currentSections, useMySections } from '../api/lecturer'
import { useApi } from '../api/admin'
import {
  Badge, Button, Card, EmptyState, Input, PageHeader, QueryState, Select, SkeletonList, Tabs,
} from '../components/ui'
import FormModal, { Checkbox, Textarea } from '../components/admin/FormModal'
import ConfirmDialog from '../components/admin/ConfirmDialog'
import { PERMS, ROLE_LABELS, ROLES, can } from '../lib/roles'
import { formatDateTime, fullName, timeAgo } from '../lib/format'

const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  body: z.string().trim().min(1, 'Write a message').max(10000),
  audience: z.enum(Object.keys(AUDIENCES)),
  courseSectionId: z.string().optional(),
  programId: z.string().optional(),
  pinned: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.audience === 'section' && !d.courseSectionId) ctx.addIssue({ code: 'custom', path: ['courseSectionId'], message: 'Choose a section' })
  if (d.audience === 'program' && !d.programId) ctx.addIssue({ code: 'custom', path: ['programId'], message: 'Choose a programme' })
})

const editSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  body: z.string().trim().min(1, 'Write a message').max(10000),
  pinned: z.boolean().optional(),
})

const audienceLabel = (a) => {
  if (a.audience === 'section' && a.section) return `${a.section.course.code} · Section ${a.section.sectionCode}`
  if (a.audience === 'program' && a.program) return a.program.name
  return AUDIENCES[a.audience]
}

function AnnouncementCard({ a, index, onEdit, onDelete }) {
  return (
    <Card className="stagger animate-fade-up p-5" style={{ '--i': index }}>
      <article>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              {a.pinned && <Pin className="size-4 text-amber-600" aria-label="Pinned" />}
              {a.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {fullName(a.author)}{a.author?.role && ` · ${ROLE_LABELS[a.author.role.name]}`} · <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</time>
            </p>
          </div>
          <Badge tone="blue"><Users className="size-3" aria-hidden /> {audienceLabel(a)}</Badge>
        </div>
        <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{a.body}</p>
        {(onEdit || onDelete) && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Sent to {a.recipientCount} {a.recipientCount === 1 ? 'person' : 'people'}</span>
            <div className="flex gap-1">
              {onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(a)}><Pencil className="size-4" aria-hidden /> Edit</Button>}
              {onDelete && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDelete(a)}><Trash2 className="size-4" aria-hidden /> Delete</Button>}
            </div>
          </div>
        )}
      </article>
    </Card>
  )
}

function AnnouncementList({ query, page, setPage, empty, onEdit, onDelete }) {
  return (
    <QueryState query={query} fallback={<Card><SkeletonList rows={3} /></Card>} errorTitle="Unable to load announcements">
      {({ items, meta }) => (items.length ? (
        <div className="space-y-4">
          {items.map((a, i) => <AnnouncementCard key={a.id} a={a} index={i} onEdit={onEdit} onDelete={onDelete} />)}
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
              <span className="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
            </div>
          )}
        </div>
      ) : <Card>{empty}</Card>)}
    </QueryState>
  )
}

/** Section options for the composer: a lecturer's own current sections, or every section for staff. */
function useSectionOptions(isLecturer, enabled) {
  const mine = useMySections({ enabled: isLecturer })
  const all = useApi(enabled && !isLecturer ? '/sections' : null, { limit: 100 })
  if (isLecturer) {
    return currentSections(mine.data ?? []).map((s) => ({ id: s.id, label: `${s.course.code} · Section ${s.sectionCode} — ${s.course.title}` }))
  }
  const rows = all.data?.items ?? all.data ?? []
  return rows.map((s) => ({ id: s.id, label: `${s.course?.code ?? 'Section'} · ${s.sectionCode}${s.semester ? ` (${s.semester.name})` : ''}` }))
}

/** One page for every role: the feed; plus composing and managing posts for those allowed to post. */
export default function Announcements() {
  const { user } = useAuth()
  const canPost = can(user, PERMS.ANNOUNCEMENT_CREATE)
  const isLecturer = user?.role?.name === ROLES.LECTURER
  const [tab, setTab] = useState('feed')
  const [page, setPage] = useState(1)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const feed = useAnnouncements({ page: tab === 'feed' ? page : 1 })
  const mine = useMyAnnouncements({ page: tab === 'mine' ? page : 1, enabled: canPost })
  const create = useCreateAnnouncement()
  const update = useUpdateAnnouncement()
  const remove = useDeleteAnnouncement()
  const sections = useSectionOptions(isLecturer, canPost && composing)
  const programs = useApi(canPost && composing && !isLecturer ? '/programs' : null)

  const audiences = isLecturer ? ['section'] : Object.keys(AUDIENCES)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        subtitle={isLecturer ? 'Updates for your classes, and news from the university.' : canPost ? 'Post updates to students and staff.' : 'News and updates from your lecturers and the university.'}
        action={canPost && <Button onClick={() => setComposing(true)}><Plus className="size-4" aria-hidden /> New announcement</Button>}
      />
      {canPost && (
        <Tabs
          variant="underline"
          items={[{ value: 'feed', label: 'All announcements' }, { value: 'mine', label: 'Posted by me', count: mine.data?.meta.total }]}
          value={tab}
          onChange={(v) => { setTab(v); setPage(1) }}
        />
      )}
      <div className="max-w-3xl">
        {tab === 'feed' ? (
          <AnnouncementList query={feed} page={page} setPage={setPage} empty={<EmptyState title="No announcements yet" icon={Megaphone}>Announcements from your lecturers and the university will appear here.</EmptyState>} />
        ) : (
          <AnnouncementList
            query={mine}
            page={page}
            setPage={setPage}
            onEdit={setEditing}
            onDelete={setDeleting}
            empty={<EmptyState title="You haven’t posted anything yet" icon={Megaphone} action={<Button size="sm" onClick={() => setComposing(true)}>New announcement</Button>} />}
          />
        )}
      </div>

      <FormModal
        open={composing}
        onClose={() => setComposing(false)}
        title="New announcement"
        schema={schema}
        wide
        submitLabel="Post announcement"
        defaultValues={{ title: '', body: '', audience: audiences[0], courseSectionId: '', programId: '', pinned: false }}
        onSubmit={async (v) => {
          const res = await create.mutateAsync({
            title: v.title, body: v.body, audience: v.audience, pinned: v.pinned || undefined,
            ...(v.audience === 'section' ? { courseSectionId: Number(v.courseSectionId) } : {}),
            ...(v.audience === 'program' ? { programId: Number(v.programId) } : {}),
          })
          toast.success('Announcement posted', { description: `Sent to ${res.recipientCount} ${res.recipientCount === 1 ? 'person' : 'people'}.` })
          setTab('mine')
        }}
      >
        {({ register, watch, formState: { errors } }) => {
          const audience = watch('audience')
          return (
            <>
              <Input label="Title" {...register('title')} error={errors.title?.message} />
              <Textarea label="Message" rows={6} {...register('body')} error={errors.body?.message} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Audience" {...register('audience')} disabled={audiences.length === 1}>
                  {audiences.map((a) => <option key={a} value={a}>{AUDIENCES[a]}</option>)}
                </Select>
                {audience === 'section' && (
                  <Select label="Section" {...register('courseSectionId')} error={errors.courseSectionId?.message}>
                    <option value="">Choose a section…</option>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                )}
                {audience === 'program' && (
                  <Select label="Programme" {...register('programId')} error={errors.programId?.message}>
                    <option value="">Choose a programme…</option>
                    {(programs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                )}
              </div>
              {!isLecturer && <Checkbox label="Pin to the top" hint="Pinned announcements stay above newer ones." {...register('pinned')} />}
              <p className="text-xs text-slate-500">Everyone in the audience also gets a notification.</p>
            </>
          )
        }}
      </FormModal>

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit announcement"
        schema={editSchema}
        wide
        defaultValues={{ title: editing?.title ?? '', body: editing?.body ?? '', pinned: editing?.pinned ?? false }}
        onSubmit={async (v) => {
          await update.mutateAsync({ id: editing.id, ...v })
          toast.success('Announcement updated')
        }}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Input label="Title" {...register('title')} error={errors.title?.message} />
            <Textarea label="Message" rows={6} {...register('body')} error={errors.body?.message} />
            {!isLecturer && <Checkbox label="Pin to the top" {...register('pinned')} />}
            <p className="text-xs text-slate-500">Edits don’t send new notifications.</p>
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this announcement?"
        confirmLabel="Delete"
        onConfirm={async () => { await remove.mutateAsync(deleting.id); toast.success('Announcement deleted') }}
      >
        <p>“{deleting?.title}” will be removed from everyone’s feed. Notifications already sent stay in people’s inboxes.</p>
      </ConfirmDialog>
    </div>
  )
}
