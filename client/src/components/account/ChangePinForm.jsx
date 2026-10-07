import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Input } from '../ui'
import { applyServerErrors, newPinSchema } from '../../lib/forms'

const schema = z
  .object({
    currentPin: z.string().min(1, 'Enter your current PIN'),
    newPin: newPinSchema,
    confirmPin: z.string(),
  })
  .refine((d) => d.newPin === d.confirmPin, { message: 'The PINs do not match', path: ['confirmPin'] })
  .refine((d) => d.currentPin !== d.newPin, { message: 'New PIN must differ from the current PIN', path: ['newPin'] })

const pinInput = { type: 'password', inputMode: 'numeric', maxLength: 6, autoComplete: 'off' }

export default function ChangePinForm({ submitLabel = 'Continue', onChanged }) {
  const { changePin } = useAuth()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (values) => {
    try {
      const user = await changePin(values)
      reset()
      onChanged?.(user)
    } catch (err) {
      if (err.status === 400) setError(/current/i.test(err.message) ? 'currentPin' : 'newPin', { message: err.message })
      else applyServerErrors(err, setError, ['currentPin', 'newPin', 'confirmPin'])
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input label="Current PIN" autoFocus error={errors.currentPin?.message} {...pinInput} {...register('currentPin')} />
      <Input label="New PIN" hint="6 digits. Avoid repeated digits, runs like 123456, and your student ID." error={errors.newPin?.message} {...pinInput} {...register('newPin')} />
      <Input label="Confirm PIN" error={errors.confirmPin?.message} {...pinInput} {...register('confirmPin')} />
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">{submitLabel}</Button>
    </form>
  )
}
