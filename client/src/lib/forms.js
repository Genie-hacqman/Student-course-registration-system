import { z } from 'zod'
import { toast } from 'sonner'
import { pinProblem } from './pin'

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number')

export const emailSchema = z.email('Enter a valid email address').max(191)

export const newPinSchema = z.string().superRefine((v, ctx) => {
  const problem = pinProblem(v)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

const FIELD_ERROR_CODES = ['VALIDATION_ERROR', 'CONFLICT']

export const applyServerErrors = (err, setError, fields) => {
  const details = FIELD_ERROR_CODES.includes(err.code) && Array.isArray(err.details) ? err.details : []
  const matched = details
    .map(({ field, message }) => ({ name: toCamel(String(field ?? '').replace(/^body\./, '')), message }))
    .filter(({ name }) => name && (!fields || fields.includes(name)))
  matched.forEach(({ name, message }) => setError(name, { type: 'server', message }))
  if (matched.length) return
  const lead = err.code === 'BAD_REQUEST' ? String(err.message).split(' ')[0] : null
  if (lead && fields?.includes(lead)) setError(lead, { type: 'server', message: err.message })
  else toast.error(friendlyMessage(err))
}

const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

export const friendlyMessage = (err) => {
  if (err.code === 'FOREIGN_KEY_CONSTRAINT') return "This can't be removed because other records still use it."
  if (err.code === 'CONFLICT' && /already exists/.test(err.message)) return 'Something with these details already exists.'
  return err.message
}

export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : undefined)

export const toLocalInputCeil = (iso) => {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  return toLocalInput(new Date(Math.ceil(t / 60_000) * 60_000).toISOString())
}

export const optionalNumber = (schema) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), schema.optional())
export const requiredNumber = (schema, message = 'Required') =>
  z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), schema.refine((n) => !Number.isNaN(n), message))
