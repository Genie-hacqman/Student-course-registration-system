import { useId } from 'react'
import { Input, cx } from './ui'
import { joinLocal, splitLocal } from '../lib/dateTime'

export default function DateTimeField({ label, value, onChange, onBlur, error, hint, className }) {
  const labelId = useId()
  const messageId = useId()
  const { date, time } = splitLocal(value)
  const describedBy = error || hint ? messageId : undefined
  const box = (type, part) => ({
    type,
    value: part === 'date' ? date : time,
    onChange: (e) => onChange(part === 'date' ? joinLocal(e.target.value, time) : joinLocal(date, e.target.value)),
    onBlur,
    invalid: Boolean(error),
    'aria-label': `${label} ${part}`,
    'aria-describedby': describedBy,
  })
  return (
    <div role="group" aria-labelledby={labelId} className={className}>
      <span id={labelId} className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
        <Input {...box('date', 'date')} />
        <Input {...box('time', 'time')} />
      </div>
      {error ? <span id={messageId} role="alert" className={cx('mt-1 block text-xs text-red-600')}>{error}</span>
        : hint && <span id={messageId} className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </div>
  )
}
