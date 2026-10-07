import { useApi } from '../api/admin'

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Student counts by department, programme and level from the server (/students/summary); the Students pages share this one cached query. */
export const useStudentSummary = () => useApi('/students/summary')
