const CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export const today = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, day: CODES[now.getDay()] }
}
