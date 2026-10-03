import crypto from 'node:crypto';
import sharp from 'sharp';
import { BadRequestError } from './errors.js';

// What an official application photo must look like. Everything is decoded and re-encoded by sharp, so only
// bytes this server produced are ever stored (a file that merely claims to be an image fails to decode).
export const PHOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const PHOTO_MIN_SIDE = 300;
export const PHOTO_MAX_SIDE = 4000;
export const PHOTO_OUTPUT_SIDE = 800;

const FORMAT_FOR_TYPE = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
export const PHOTO_TYPES = Object.keys(FORMAT_FOR_TYPE);

/**
 * Validates an uploaded photo and returns a clean JPEG: auto-rotated, flattened onto white, fitted inside
 * 800 px, with all metadata (EXIF, GPS location) stripped. Throws BadRequestError with a user-facing message.
 */
export const normalizeOfficialPhoto = async (input, declaredType) => {
  const expected = FORMAT_FOR_TYPE[declaredType];
  if (!expected) throw new BadRequestError('Upload a JPG, PNG or WebP photo');
  if (!Buffer.isBuffer(input) || input.length === 0) throw new BadRequestError('No photo was received');
  if (input.length > PHOTO_MAX_UPLOAD_BYTES) throw new BadRequestError('That photo is too large — choose one under 2 MB');

  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: PHOTO_MAX_SIDE * PHOTO_MAX_SIDE }).metadata();
  } catch {
    throw new BadRequestError('That file is not a valid image');
  }
  if (meta.format !== expected) throw new BadRequestError('That file is not the type of image it claims to be');
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < PHOTO_MIN_SIDE) {
    throw new BadRequestError(`That photo is too small — it must be at least ${PHOTO_MIN_SIDE} pixels on each side`);
  }
  if (Math.max(meta.width, meta.height) > PHOTO_MAX_SIDE) {
    throw new BadRequestError(`That photo is too large — it must be at most ${PHOTO_MAX_SIDE} pixels on each side`);
  }

  let output;
  try {
    output = await sharp(input, { limitInputPixels: PHOTO_MAX_SIDE * PHOTO_MAX_SIDE })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: PHOTO_OUTPUT_SIDE, height: PHOTO_OUTPUT_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new BadRequestError('That file is not a valid image');
  }
  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    sha256: crypto.createHash('sha256').update(output.data).digest('hex'),
  };
};

/** A square, centred-on-the-subject JPEG data URL of `side` px (used for the profile-picture copy at admission). */
export const squareDataUrl = async (input, side, quality = 85) => {
  const out = await sharp(input).resize(side, side, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
};
