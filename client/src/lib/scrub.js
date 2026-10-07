const SECRET_QUERY = /([?&](?:token|code)=)[^&\s"'#]+/gi

export const scrubUrl = (value) => (typeof value === 'string' ? value.replace(SECRET_QUERY, '$1[redacted]') : value)
