import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Upload } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import { requiredNumber } from '../../lib/forms'
import { useAuth } from '../../auth/AuthProvider'
import { PERMS, can } from '../../lib/roles'

export const courseSchema = z.object({
  code: z.string().trim().min(2, 'At least 2 characters').max(20).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only').transform((v) => v.toUpperCase()),
  title: z.string().trim().min(2, 'At least 2 characters').max(200),
  departmentId: requiredNumber(z.number().int().positive('Choose a department'), 'Choose a department'),
  credits: requiredNumber(z.number().int().min(0).max(12)),
  level: requiredNumber(z.number().int().min(100).max(900)),
  description: z.string().trim().max(5000).optional(),
})

export function CourseForm({ editing, onClose, onSaved }) {
  const departments = useApi('/departments')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/courses/${id}`, body) : http.post('/courses', body)), {
    success: (_d, v) => (v.id ? 'Course updated' : 'Course created'),
  })
  return (
    <FormModal
      open={Boolean(editing)}
      onClose={onClose}
      wide
      title={editing?.id ? `Edit ${editing.code}` : 'New course'}
      schema={courseSchema}
      defaultValues={{
        code: editing?.code ?? '',
        title: editing?.title ?? '',
        departmentId: editing?.departmentId ?? '',
        credits: editing?.credits ?? 3,
        level: editing?.level ?? 100,
        description: editing?.description ?? '',
      }}
      onSubmit={async (values) => {
        const saved = await save.mutateAsync({ id: editing?.id, ...values })
        onSaved?.(saved)
      }}
    >
      {({ register, formState: { errors } }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Code" placeholder="e.g. CS305" error={errors.code?.message} {...register('code')} />
            <Input label="Title" className="sm:col-span-2" error={errors.title?.message} {...register('title')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
              <option value="">Select department</option>
              {departments.data?.filter((d) => d.status !== 'archived' || d.id === editing?.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Input label="Credits" type="number" error={errors.credits?.message} {...register('credits')} />
            <Input label="Level" type="number" step={100} error={errors.level?.message} {...register('level')} />
          </div>
          <Textarea label="Description" rows={4} error={errors.description?.message} {...register('description')} />
        </>
      )}
    </FormModal>
  )
}

export default function Courses() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const departments = useApi('/departments')
  const programs = useApi('/programs')
  const { user } = useAuth()
  const canEdit = can(user, PERMS.COURSE_CATALOG)
  const filters = {
    search: params.get('search') || undefined,
    departmentId: params.get('department') || undefined,
    programId: params.get('program') || undefined,
    level: params.get('level') || undefined,
    status: params.get('status') || undefined,
    page: Number(params.get('page') ?? 1),
    limit: 20,
  }
  const courses = useApi('/courses', filters)
  const [editing, setEditing] = useState(null)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="The course catalog. A course reaches students once it is on their programme's curriculum and has a section this semester."
        action={canEdit && (
          <div className="flex gap-2">
            <Link to="/staff/courses/import"><Button variant="secondary"><Upload className="size-4" /> Import courses</Button></Link>
            <Button onClick={() => setEditing({})}><Plus className="size-4" /> New course</Button>
          </div>
        )}
      />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-6">
        <form className="relative md:col-span-2" onSubmit={(e) => { e.preventDefault(); set('search', search.trim()) }}>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => set('search', search.trim())}
            placeholder="Search code or title, then Enter"
            aria-label="Search courses"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </form>
        <Select value={params.get('department') ?? ''} onChange={(e) => set('department', e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={params.get('program') ?? ''} onChange={(e) => set('program', e.target.value)} aria-label="Programme">
          <option value="">All programmes</option>
          {(programs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
        </Select>
        <Select value={params.get('level') ?? ''} onChange={(e) => set('level', e.target.value)} aria-label="Level">
          <option value="">All levels</option>
          {[100, 200, 300, 400, 500, 600].map((l) => <option key={l} value={l}>Level {l}</option>)}
        </Select>
        <Select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status">
          <option value="">Active & archived</option>
          <option value="active">Active</option>
          <option value="inactive">Archived</option>
        </Select>
      </Card>
      <Card>
        <QueryState query={courses}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty="No courses match"
              onRowClick={(c) => navigate(`/staff/courses/${c.id}`)}
              columns={[
                { key: 'code', header: 'Code', render: (c) => <span className="font-medium">{c.code}</span> },
                { key: 'title', header: 'Title' },
                { key: 'department', header: 'Department', render: (c) => c.department?.code },
                { key: 'credits', header: 'Credits' },
                { key: 'level', header: 'Level' },
                { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'active' ? 'green' : 'slate'}>{c.status === 'active' ? 'Active' : 'Archived'}</Badge> },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <CourseForm editing={editing} onClose={() => setEditing(null)} onSaved={(c) => c && navigate(`/staff/courses/${c.id}`)} />
    </div>
  )
}
