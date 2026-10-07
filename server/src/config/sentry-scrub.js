const SECRET_QUERY = /([?&](?:token|code)=)[^&\s"'#]+/gi;
const SECRET_KEYS = /^(password|newpassword|currentpassword|pin|newpin|confirmpin|currentpin|otp|token|accesstoken|refreshtoken|authorization|cookie)$/i;

const redact = (value) => (typeof value === 'string' ? value.replace(SECRET_QUERY, '$1[redacted]') : value);

const scrubObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj)
    .filter(([key]) => !SECRET_KEYS.test(key))
    .map(([key, value]) => [key, value && typeof value === 'object' && !Array.isArray(value) ? scrubObject(value) : redact(value)]));
};

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
