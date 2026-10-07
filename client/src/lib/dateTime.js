import { z } from 'zod'

const COMPLETE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export const splitLocal = (value) => {
  const [date = '', time = ''] = String(value ?? '').split('T')
  return { date, time }
}

export const joinLocal = (date, time) => (date || time ? `${date ?? ''}T${time ?? ''}` : '')

export const localDateTime = ({ required = true } = {}) => {
  const schema = z.string().superRefine((value, ctx) => {
    const { date, time } = splitLocal(value)
    const problem = !date && !time ? (required ? 'Required' : null)
      : !date ? 'Choose a date'
        : !time ? 'Choose a time'
          : COMPLETE.test(value) ? null : 'Enter a valid date and time'
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })
  return required ? schema : schema.optional()
}
