import { useApi } from '../api/admin'

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export const useStudentSummary = () => useApi('/students/summary')
