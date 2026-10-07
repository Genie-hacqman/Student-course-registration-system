import { forwardRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Modal, cx } from '../ui'
import { applyServerErrors } from '../../lib/forms'

export default function FormModal({ open, onClose, title, schema, defaultValues, onSubmit, submitLabel = 'Save', children, wide, onError }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues })
  const { handleSubmit, reset, setError, formState: { isSubmitting } } = form

  useEffect(() => {
    if (open) reset(defaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      if (onError?.(err)) return
      applyServerErrors(err, setError, schema.shape ? Object.keys(schema.shape) : undefined)
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide={wide}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="form-modal" loading={isSubmitting}>{submitLabel}</Button>
        </>
      )}
    >
      <form id="form-modal" onSubmit={submit} noValidate className="space-y-4">
        {children(form)}
      </form>
    </Modal>
  )
}

export const Textarea = forwardRef(function Textarea({ label, error, hint, className, ...props }, ref) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <textarea
        ref={ref}
        rows={3}
        className={cx(
          'block w-full rounded-lg border-0 px-3 py-2 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:outline-none',
          error ? 'ring-red-400' : 'ring-slate-300 focus:ring-brand-500',
        )}
        {...props}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span>
        : hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
})

export const Checkbox = forwardRef(function Checkbox({ label, hint, ...props }, ref) {
  return (
    <label className="flex items-start gap-2.5">
      <input ref={ref} type="checkbox" className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...props} />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
})
