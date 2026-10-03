// Kept free of app configuration so scripts (e.g. `npm run sentry:test`) can use it without a full .env.

// Query values that are secrets in this app: activation, reset and verification links carry `token=`, slips carry `code=`.
const SECRET_QUERY = /([?&](?:token|code)=)[^&\s"'#]+/gi;
// Never ship these to a third party, wherever they appear in an event's extra data.
const SECRET_KEYS = /^(password|newpassword|currentpassword|pin|newpin|confirmpin|currentpin|otp|token|accesstoken|refreshtoken|authorization|cookie)$/i;

const redact = (value) => (typeof value === 'string' ? value.replace(SECRET_QUERY, '$1[redacted]') : value);

const scrubObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj)
    .filter(([key]) => !SECRET_KEYS.test(key))
    .map(([key, value]) => [key, value && typeof value === 'object' && !Array.isArray(value) ? scrubObject(value) : redact(value)]));
};

/**
 * Last stop before an event leaves the server: secret query values are redacted from the message, exception
 * text, request URL and breadcrumbs, and secret-named fields are dropped from extras. Exported for tests.
 */
export const scrubEvent = (event) => {
  if (!event) return event;
  const out = { ...event };
  if (out.message) out.message = redact(out.message);
  if (out.request) {
    out.request = { ...out.request, url: redact(out.request.url), query_string: undefined, cookies: undefined, data: undefined };
    if (out.request.headers) out.request.headers = scrubObject(out.request.headers);
  }
  if (out.extra) out.extra = scrubObject(out.extra);
  if (out.exception?.values) {
    out.exception = { ...out.exception, values: out.exception.values.map((v) => ({ ...v, value: redact(v.value) })) };
  }
  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs.map((b) => ({ ...b, message: redact(b.message), data: b.data ? scrubObject(b.data) : b.data }));
  }
  return out;
};
