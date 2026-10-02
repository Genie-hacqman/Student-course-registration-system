// Profile pictures are cropped to a square and shrunk in the browser, so uploads stay a few tens of KB.

export const AVATAR_SIZE = 256
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

/** Centre-crops the file to a square and returns a `size`px JPEG data URL. */
export async function fileToAvatarDataUrl(file, size = AVATAR_SIZE) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That file could not be read as a picture')
  try {
    const { sx, sy, size: side } = squareCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // transparent PNGs would turn black as JPEG
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    bitmap.close?.()
  }
}
