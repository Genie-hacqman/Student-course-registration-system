import { useSearchParams } from 'react-router-dom'
import { useApi } from '../../api/admin'
import { SearchInput, Tabs } from '../ui'
import StudentTable from './StudentTable'

/**
 * A programme's students, by level: level tabs with counts, a search box, then the student list.
 * `levels` is `[{ level, students }]` from the server (the caller already has it); `?level`, `?search` and `?page` live in the URL.
 */
export default function ProgramStudentList({ programId, levels, countsReady = true }) {
  const [params, setParams] = useSearchParams()
  const level = params.get('level') ?? ''
  const search = params.get('search') ?? ''
  const page = Number(params.get('page') ?? 1)
  const total = levels.reduce((sum, l) => sum + l.students, 0)
  const students = useApi(`/programs/${programId}/students`, { level: level || undefined, search: search || undefined, page, limit: 20, sort: 'name' })
  const set = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const tabs = [{ value: '', label: 'All levels', count: countsReady ? total : undefined }, ...levels.map((l) => ({ value: String(l.level), label: `Level ${l.level}`, count: l.students }))]
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Tabs items={tabs} value={level} onChange={(v) => set({ level: v })} label="Level" />
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set({ search: v })} placeholder="Name, Student ID or email" className="w-full sm:w-64" />
      </div>
      <StudentTable query={students} showProgram={false} showDepartment={false} onPage={(n) => set({ page: n })} empty="No students on this programme match" />
    </>
  )
}
