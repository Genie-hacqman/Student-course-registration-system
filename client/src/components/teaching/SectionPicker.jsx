import { useSearchParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { currentSections, useMySections } from '../../api/lecturer'
import { Card, EmptyState, ErrorState, Select, Skeleton } from '../ui'

export function WithSection({ children, label = 'Course' }) {
  const sections = useMySections()
  const [params, setParams] = useSearchParams()
  if (sections.isPending) return <Skeleton className="h-10 w-full max-w-md" />
  if (sections.isError) return <Card><ErrorState error={sections.error} onRetry={() => sections.refetch()} /></Card>
  const list = currentSections(sections.data)
  if (!list.length) {
    return <Card><EmptyState title="No courses assigned yet" icon={BookOpen}>The registry assigns lecturers to course sections.</EmptyState></Card>
  }
  const chosen = list.find((s) => String(s.id) === params.get('section')) ?? list[0]
  const choose = (id) => {
    const next = new URLSearchParams(params)
    next.set('section', id)
    setParams(next, { replace: true })
  }
  return (
    <div className="space-y-6">
      <Select label={label} value={chosen.id} onChange={(e) => choose(e.target.value)} className="max-w-md">
        {list.map((s) => (
          <option key={s.id} value={s.id}>{s.course.code} · Section {s.sectionCode} — {s.course.title}</option>
        ))}
      </Select>
      {children(chosen)}
    </div>
  )
}
