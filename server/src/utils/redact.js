const SECRET_KEY = /(password|passwd|secret|token|hash|otp|credential)/i;
const SECRET_KEY_EXACT = /^(pin|newpin|currentpin|confirmpin|temporarypin|temppin|verificationcode)$/i;

export const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

export const isSecretKey = (key) => SECRET_KEY.test(key) || SECRET_KEY_EXACT.test(key);

export const redactSecrets = (value, depth = 0) => {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, isSecretKey(k) ? REDACTED : redactSecrets(v, depth + 1)]),
  );
};

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const STUDENT_ID = /^STU\d{4,}$/i;

export const safeLoginIdentifier = (identifier) => {
  const value = typeof identifier === 'string' ? identifier.trim() : '';
  return EMAIL.test(value) || STUDENT_ID.test(value) ? value.slice(0, 255) : REDACTED;
};
