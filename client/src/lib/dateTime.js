import { z } from 'zod'

const COMPLETE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * A form's local date and time travel as one string, "YYYY-MM-DDTHH:mm" (what `toLocalInput` and `fromLocalInput` use),
 * while the person edits them in two boxes. While only one box is filled the string is partial: "2027-05-01T" or "T09:00".
 */
export const splitLocal = (value) => {
  const [date = '', time = ''] = String(value ?? '').split('T')
  return { date, time }
}

export const joinLocal = (date, time) => (date || time ? `${date ?? ''}T${time ?? ''}` : '')

/** A required (or optional) local date-time. Says which half is missing, so the message points at the right box. */
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
