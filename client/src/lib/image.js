// Profile pictures are cropped to a square and shrunk in the browser, so uploads stay a few tens of KB.

export const AVATAR_SIZE = 256
export const THUMB_SIZE = 48 // for list pages: about 2 KB instead of ~25 KB per row
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024

/** A message when the picked file can't be used, else null. */
export const avatarFileError = (file) => {
  if (!file) return 'Choose a picture'
  if (!AVATAR_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP picture'
  if (file.size > AVATAR_MAX_INPUT_BYTES) return 'That picture is over 5 MB — choose a smaller one'
  return null
}

/** The largest centred square inside a width x height image. */
export const squareCrop = (width, height) => {
  const size = Math.min(width, height)
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size }
}

const squareJpeg = (bitmap, size, quality) => {
  const { sx, sy, size: side } = squareCrop(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Centre-crops the file to a square and returns the full picture and a small thumbnail, both JPEG data URLs. */
export async function fileToAvatarImages(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That file could not be read as a picture')
  try {
    return { image: squareJpeg(bitmap, AVATAR_SIZE, 0.85), thumb: squareJpeg(bitmap, THUMB_SIZE, 0.8) }
  } finally {
    bitmap.close?.()
  }
}

// The official application photo is a portrait (passport-style, 3:4), cropped in the browser so the preview is
// exactly what gets stored. The server decodes and re-encodes whatever it receives, so this is a convenience, not a
// trust boundary.
export const PHOTO_WIDTH = 600
export const PHOTO_HEIGHT = 800
export const PHOTO_MIN_SIDE = 300
export const PHOTO_ASPECT = 3 / 4

/** The largest centred 3:4 portrait rectangle inside a width x height image. */
export const portraitCrop = (width, height) => {
  let cropWidth = width
  let cropHeight = Math.round(width / PHOTO_ASPECT)
  if (cropHeight > height) {
    cropHeight = height
    cropWidth = Math.round(height * PHOTO_ASPECT)
  }
  return { sx: Math.round((width - cropWidth) / 2), sy: Math.round((height - cropHeight) / 2), width: cropWidth, height: cropHeight }
}

/** A message when the picked file can't be used as an official photo, else null (the picture checks plus a minimum size). */
export const photoDimensionsError = (width, height) =>
  Math.min(width, height) < PHOTO_MIN_SIDE ? `That photo is too small. It must be at least ${PHOTO_MIN_SIDE} pixels on each side.` : null

/** Centre-crops the file to 3:4 and returns a 600x800 JPEG Blob. Rejects with a readable message. */
export async function fileToOfficialPhoto(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That file could not be read as a picture')
  try {
    const tooSmall = photoDimensionsError(bitmap.width, bitmap.height)
    if (tooSmall) throw new Error(tooSmall)
    const { sx, sy, width, height } = portraitCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_WIDTH
    canvas.height = PHOTO_HEIGHT
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
    ctx.drawImage(bitmap, sx, sy, width, height, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error('That picture could not be prepared. Try a different one.')
    return blob
  } finally {
    bitmap.close?.()
  }
}
