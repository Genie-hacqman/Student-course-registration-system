import { ImageOff, Lock } from 'lucide-react'
import { useOfficialPhotoUrl } from '../../api/applications'
import { cx } from '../ui'
import { PhotoFrame } from './ApplicationPhoto'

export default function OfficialPhoto({ source, photo, className }) {
  const { url, isLoading, isError, retry } = useOfficialPhotoUrl({ present: photo?.present, version: photo?.uploadedAt, source })
  return (
    <figure className="shrink-0">
      <PhotoFrame url={url} loading={isLoading} error={isError} onRetry={retry} alt="Official application photo" className={cx('w-32 sm:w-40', className)} />
      <figcaption className="mt-2 flex items-center justify-center gap-1 text-center text-xs font-medium text-slate-600">
        <Lock className="size-3" aria-hidden /> Official Application Photo
      </figcaption>
      {!photo?.present && <p className="mt-1 text-center text-xs text-slate-500">No photo on file</p>}
    </figure>
  )
}

export function OfficialPhotoThumb({ applicationId, photo, name }) {
  const { url, isError } = useOfficialPhotoUrl({ present: photo?.present, version: photo?.uploadedAt, source: `review:${applicationId}`, size: 'thumb' })
  const box = 'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200'
  if (url) return <img src={url} alt={`${name}'s application photo`} className={cx(box, 'object-cover')} />
  return (
    <span className={box} title={isError ? "Photo couldn't be loaded" : photo?.present ? 'Loading photo' : 'No application photo'}>
      <ImageOff className={cx('size-4', isError ? 'text-amber-500' : 'text-slate-400')} aria-hidden />
    </span>
  )
}
