import { PageHeader } from '../../components/ui'
import { WithSection } from '../../components/teaching/SectionPicker'
import GradeSheet from '../../components/GradeSheet'

export default function LecturerResults() {
  return (
    <div>
      <PageHeader title="Results" subtitle="Enter final grades for each course and submit them once everyone is graded." />
      <WithSection>{(section) => <GradeSheet key={section.id} sectionId={String(section.id)} />}</WithSection>
    </div>
  )
}
