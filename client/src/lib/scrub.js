// Query values that are secrets in this app: activation, reset and verification links carry `token=` in the page URL,
// slip verification carries `code=`. Kept separate (no Sentry import) so it can be unit-tested in plain Node.
const SECRET_QUERY = /([?&](?:token|code)=)[^&\s"'#]+/gi

/** "…/activate-account?token=abc&x=1" → "…/activate-account?token=[redacted]&x=1". Non-strings pass through. */
export const scrubUrl = (value) => (typeof value === 'string' ? value.replace(SECRET_QUERY, '$1[redacted]') : value)
