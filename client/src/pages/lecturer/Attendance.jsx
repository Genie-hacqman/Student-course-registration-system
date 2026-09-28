import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { WithSection } from '../../components/teaching/SectionPicker'
import { AttendancePanel } from '../../components/teaching/AttendancePanel'

export default function LecturerAttendance() {
  const [params] = useSearchParams()
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Record who attended each class and follow up on low attendance." />
      <WithSection>{(section) => <AttendancePanel key={section.id} section={section} initialSlot={params.get('slot') ?? undefined} />}</WithSection>
    </div>
  )
}
