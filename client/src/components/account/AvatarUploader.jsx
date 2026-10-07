import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Camera, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { authApi } from '../../api/auth'
import { Avatar, Button } from '../ui'
import { AVATAR_TYPES, avatarFileError, fileToAvatarImages } from '../../lib/image'

export default function AvatarUploader({ onSaved }) {
  const { user, setProfile } = useAuth()
  const input = useRef(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  const save = useMutation({
    mutationFn: authApi.setAvatar,
    onSuccess: (profile) => {
      setProfile(profile)
      setPreview(null)
      toast.success('Profile picture saved')
      onSaved?.(profile)
    },
    onError: (err) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: authApi.removeAvatar,
    onSuccess: (profile) => { setProfile(profile); toast.success('Profile picture removed') },
    onError: (err) => setError(err.message),
  })

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    const problem = avatarFileError(file)
    if (problem) return setError(problem)
    setReading(true)
    try {
      setPreview(await fileToAvatarImages(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setReading(false)
    }
  }

  const shown = preview ? { ...user, avatar: preview.image } : user
  const hasPicture = Boolean(user?.avatar)

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="relative">
        <Avatar user={shown} size="xl" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={hasPicture ? 'Change profile picture' : 'Add profile picture'}
          className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-300 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Camera className="size-4" aria-hidden />
        </button>
        <input ref={input} type="file" accept={AVATAR_TYPES.join(',')} onChange={onPick} className="sr-only" tabIndex={-1} aria-hidden />
      </div>

      <div className="min-w-0 space-y-2">
        {preview ? (
          <>
            <p className="text-sm text-slate-600">This is how your picture will look. It's cropped to a square around the centre.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={save.isPending} onClick={() => { setError(''); save.mutate(preview) }}>Save picture</Button>
              <Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => { setPreview(null); setError('') }}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={hasPicture ? 'secondary' : 'primary'} loading={reading} onClick={() => input.current?.click()}>
                <Camera className="size-4" aria-hidden /> {hasPicture ? 'Change picture' : 'Upload picture'}
              </Button>
              {hasPicture && (
                <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => { setError(''); remove.mutate() }}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500">Optional. JPG, PNG or WebP, up to 5 MB.</p>
          </>
        )}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
