import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Camera, ImageOff, Lock, RotateCw, Trash2 } from 'lucide-react'
import { useOfficialPhotoUrl, useRemoveOfficialPhoto, useSetOfficialPhoto } from '../../api/applications'
import { Badge, Button, Spinner, cx } from '../ui'
import { AVATAR_TYPES, avatarFileError, fileToOfficialPhoto } from '../../lib/image'

export function PhotoFrame({ url, loading, error, onRetry, alt, className }) {
  return (
    <div className={cx('relative flex aspect-3/4 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-300 sm:w-36', className)}>
      {url ? <img src={url} alt={alt} className="size-full object-cover" />
        : loading ? <Spinner />
          : error ? (
            <div role="alert" className="flex flex-col items-center gap-1.5 px-2 text-center">
              <AlertTriangle className="size-6 text-amber-500" aria-hidden />
              <span className="text-xs text-slate-600">Photo couldn't be loaded</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  <RotateCw className="size-3" aria-hidden /> Retry
                </button>
              )}
            </div>
          )
            : <ImageOff className="size-8 text-slate-400" aria-hidden />}
    </div>
  )
}

export default function ApplicationPhoto({ photo, onChange }) {
  const input = useRef(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const upload = useSetOfficialPhoto()
  const remove = useRemoveOfficialPhoto()

  const locked = Boolean(photo?.locked)
  const present = Boolean(photo?.present)
  const stored = useOfficialPhotoUrl({ present, version: photo?.uploadedAt })

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    const problem = avatarFileError(file)
    if (problem) return setError(problem)
    setReading(true)
    try {
      const blob = await fileToOfficialPhoto(file)
      clearPreview()
      setPreview({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(err.message)
    } finally {
      setReading(false)
    }
  }

  const save = () => {
    setError('')
    upload.mutate(preview.blob, {
      onSuccess: ({ application }) => {
        clearPreview()
        onChange?.(application.photo)
        toast.success(present ? 'Photo replaced' : 'Photo saved')
      },
      onError: (err) => setError(err.message),
    })
  }

  const removeStored = () => {
    setError('')
    remove.mutate(undefined, {
      onSuccess: ({ application }) => {
        onChange?.(application.photo)
        toast.success('Photo removed')
      },
      onError: (err) => setError(err.message),
    })
  }

  if (locked) {
    return (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <PhotoFrame url={stored.url} loading={stored.isLoading} error={stored.isError} onRetry={stored.retry} alt="Official application photo" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">Official Application Photo</p>
          <Badge tone="slate"><Lock className="mr-1 size-3" aria-hidden /> Locked after submission</Badge>
          <p className="max-w-md text-sm text-slate-600">
            {present
              ? 'This is the photograph you submitted with your application. It is part of your admission record and cannot be changed or removed.'
              : 'No photograph was recorded with this application.'}
          </p>
        </div>
      </div>
    )
  }

  const shownUrl = preview?.url ?? stored.url
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <PhotoFrame
        url={shownUrl}
        loading={reading || (!preview && stored.isLoading)}
        error={!preview && stored.isError}
        onRetry={stored.retry}
        alt={preview ? 'Preview of your photo' : 'Your application photo'}
        className={!present && !preview ? 'ring-2 ring-amber-400' : undefined}
      />
      <div className="min-w-0 space-y-2">
        {preview ? (
          <>
            <p className="text-sm text-slate-600">This is how your photo will be stored. It is cropped to a portrait around the centre.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={upload.isPending} onClick={save}>{present ? 'Save replacement' : 'Save photo'}</Button>
              <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={() => { clearPreview(); setError('') }}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={present ? 'secondary' : 'primary'} loading={reading} onClick={() => input.current?.click()}>
                <Camera className="size-4" aria-hidden /> {present ? 'Replace photo' : 'Upload photo'}
              </Button>
              {present && (
                <Button size="sm" variant="ghost" loading={remove.isPending} onClick={removeStored}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              )}
            </div>
            <p className="max-w-md text-xs text-slate-500">
              Required. A clear, front-facing passport-style photo on a plain background, with good lighting. JPG, PNG or WebP, at least 300 px on each side.
              You can replace or remove it until you submit; after that it is locked.
            </p>
          </>
        )}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
      <input ref={input} type="file" accept={AVATAR_TYPES.join(',')} onChange={onPick} className="sr-only" tabIndex={-1} aria-hidden />
    </div>
  )
}
