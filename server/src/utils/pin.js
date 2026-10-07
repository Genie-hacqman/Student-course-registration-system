import { randomInt } from 'node:crypto';

export const PIN_LENGTH = 6;
export const PIN_PATTERN = /^\d{6}$/;

const isRun = (pin, step) => [...pin].every((d, i) => i === 0 || Number(d) === (Number(pin[i - 1]) + step + 10) % 10);

export const pinProblem = (pin, { studentNumber } = {}) => {
  if (!PIN_PATTERN.test(pin)) return `PIN must be exactly ${PIN_LENGTH} digits`;
  if (/^(\d)\1+$/.test(pin)) return 'PIN cannot be the same digit repeated';
  if (isRun(pin, 1) || isRun(pin, -1)) return 'PIN cannot be a run of consecutive digits';
  const idDigits = studentNumber?.replace(/\D/g, '') ?? '';
  if (idDigits.length >= PIN_LENGTH && idDigits.includes(pin)) return 'PIN cannot be part of your student ID';
  return null;
};

export const generatePin = (opts) => {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!pinProblem(pin, opts)) return pin;
  }
};

export const schoolEmailFor = (studentNumber, domain) => `${studentNumber.toLowerCase()}@${domain.toLowerCase()}`;

export const sessionStartYear = (session) => Number(session.slice(0, 4));
