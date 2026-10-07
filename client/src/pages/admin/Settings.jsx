import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Button, Card, CardHeader, Input, PageHeader, QueryState, Select } from '../../components/ui'
import { Checkbox } from '../../components/admin/FormModal'
import { applyServerErrors, requiredNumber } from '../../lib/forms'

const PASSING_GRADES = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E', 'F']
const schema = z.object({
  'institution.name': z.string().trim().min(2, 'At least 2 characters').max(150),
  'institution.studentEmailDomain': z.union([
    z.literal(''),
    z.string().trim().toLowerCase().regex(/^(?=.{3,120}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, 'A domain such as school.edu.gh'),
  ]),
  'institution.staffEmailDomain': z.union([
    z.literal(''),
    z.string().trim().toLowerCase().regex(/^(?=.{3,120}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, 'A domain such as staff.school.edu.gh'),
  ]),
  'teaching.restrictLecturerDepartment': z.boolean(),
  'registration.requireApproval': z.boolean(),
  'registration.waitlistEnabled': z.boolean(),
  'registration.defaultMaxCredits': requiredNumber(z.number().int().min(1).max(60)),
  'grades.passingGrade': z.enum(PASSING_GRADES),
})
const KEYS = Object.keys(schema.shape)
const field = (key) => key.replaceAll('.', '__')

const DEFAULTS = {
  'institution.name': 'Student Course Registration System',
  'institution.studentEmailDomain': '',
  'institution.staffEmailDomain': '',
  'teaching.restrictLecturerDepartment': true,
  'registration.requireApproval': true,
  'registration.waitlistEnabled': true,
  'registration.defaultMaxCredits': 24,
  'grades.passingGrade': 'D',
}

function SettingsForm({ rows }) {
  const current = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
  const save = useApiMutation((settings) => http.patch('/admin/settings', { settings }), { success: 'Settings saved' })
  const formSchema = z.object(Object.fromEntries(KEYS.map((k) => [field(k), schema.shape[k]])))
  const { register, handleSubmit, setError, reset, formState: { errors, isDirty, isSubmitting, dirtyFields } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: Object.fromEntries(KEYS.map((k) => [field(k), current[k]])),
  })

  const onSubmit = async (values) => {
    const changed = KEYS.filter((k) => dirtyFields[field(k)]).map((k) => ({ key: k, value: values[field(k)] }))
    try {
      await save.mutateAsync(changed)
      reset(values)
    } catch (err) {
      applyServerErrors(err, setError)
    }
  }
  const err = (k) => errors[field(k)]?.message

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Institution" />
        <div className="max-w-md space-y-4 px-5 py-5">
          <Input label="Name" hint="Printed on registration slips" error={err('institution.name')} {...register(field('institution.name'))} />
          <Input
            label="Student email domain"
            placeholder="school.edu.gh"
            hint="Admitted students get <studentId>@this domain, e.g. stu202600123@school.edu.gh. Required before admitting students."
            error={err('institution.studentEmailDomain')}
            {...register(field('institution.studentEmailDomain'))}
          />
          <Input
            label="Staff email domain (optional)"
            placeholder="staff.school.edu.gh"
            hint="When set, a new lecturer without a school email gets first.last@this domain."
            error={err('institution.staffEmailDomain')}
            {...register(field('institution.staffEmailDomain'))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Teaching" />
        <div className="px-5 py-5">
          <Checkbox
            label="Lecturers teach only their own department's courses"
            hint="When on, the registry can only assign a lecturer to courses of the lecturer's department."
            {...register(field('teaching.restrictLecturerDepartment'))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Registration" />
        <div className="space-y-5 px-5 py-5">
          <Checkbox
            label="Registrations need approval"
            hint="When off, every programme's registrations are approved automatically. When on, only programmes set to auto-approve skip the registrar."
            {...register(field('registration.requireApproval'))}
          />
          <Checkbox
            label="Waitlists"
            hint="Lets students queue for full sections. Each section can also switch its own waitlist off."
            {...register(field('registration.waitlistEnabled'))}
          />
          <Input
            className="max-w-xs"
            label="Default maximum credits"
            type="number"
            hint="Used when neither the semester nor the program sets a limit"
            error={err('registration.defaultMaxCredits')}
            {...register(field('registration.defaultMaxCredits'))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Grades" />
        <div className="max-w-xs px-5 py-5">
          <Select label="Passing grade" error={err('grades.passingGrade')} {...register(field('grades.passingGrade'))}>
            {PASSING_GRADES.map((g) => <option key={g} value={g}>{g} or better</option>)}
          </Select>
          <p className="mt-1 text-xs text-slate-500">Used for prerequisites that don't set their own minimum grade, and for credits earned.</p>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={!isDirty} onClick={() => { reset(); toast('Changes discarded') }}>Discard</Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  )
}

export default function Settings() {
  const settings = useApi('/admin/settings')
  return (
    <div>
      <PageHeader title="Settings" subtitle="System-wide rules. Changes apply immediately." />
      <QueryState query={settings}>{(rows) => <SettingsForm rows={rows} />}</QueryState>
    </div>
  )
}
