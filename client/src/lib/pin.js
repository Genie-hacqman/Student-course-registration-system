export const PIN_PATTERN = /^\d{6}$/

const isRun = (pin, step) => [...pin].every((d, i) => i === 0 || Number(d) === (Number(pin[i - 1]) + step + 10) % 10)

export const pinProblem = (pin) => {
  if (!PIN_PATTERN.test(pin)) return 'PIN must be exactly 6 digits'
  if (/^(\d)\1+$/.test(pin)) return 'PIN cannot be the same digit repeated'
  if (isRun(pin, 1) || isRun(pin, -1)) return 'PIN cannot be a run of consecutive digits'
  return null
}
