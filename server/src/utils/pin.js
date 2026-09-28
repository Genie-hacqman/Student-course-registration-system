import { randomInt } from 'node:crypto';

/*
 * Student PINs: 6 digits. That's a small space (10^6), which is why sign-in has a per-account
 * lockout on top of the per-IP rate limit, and why the obviously guessable PINs below are refused.
 */

export const PIN_LENGTH = 6;
export const PIN_PATTERN = /^\d{6}$/;

const isRun = (pin, step) => [...pin].every((d, i) => i === 0 || Number(d) === (Number(pin[i - 1]) + step + 10) % 10);

/** Why a PIN is unacceptable, or null. `studentNumber` stops students reusing their own ID digits. */
export const pinProblem = (pin, { studentNumber } = {}) => {
  if (!PIN_PATTERN.test(pin)) return `PIN must be exactly ${PIN_LENGTH} digits`;
  if (/^(\d)\1+$/.test(pin)) return 'PIN cannot be the same digit repeated';
  if (isRun(pin, 1) || isRun(pin, -1)) return 'PIN cannot be a run of consecutive digits';
  const idDigits = studentNumber?.replace(/\D/g, '') ?? '';
  if (idDigits.length >= PIN_LENGTH && idDigits.includes(pin)) return 'PIN cannot be part of your student ID';
  return null;
};

/** A random PIN that passes `pinProblem`, from a CSPRNG. */
export const generatePin = (opts) => {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!pinProblem(pin, opts)) return pin;
  }
};

/** "STU202600123" + "school.edu.gh" → "stu202600123@school.edu.gh" */
export const schoolEmailFor = (studentNumber, domain) => `${studentNumber.toLowerCase()}@${domain.toLowerCase()}`;

/** "2026/2027" → 2026 */
export const sessionStartYear = (session) => Number(session.slice(0, 4));
