import { PageHeader } from '../../components/ui'
import { WithSection } from '../../components/teaching/SectionPicker'
import { AssessmentsPanel } from '../../components/teaching/AssessmentsPanel'

export default function LecturerAssessments() {
  return (
    <div>
      <PageHeader title="Assessments" subtitle="Create coursework, enter scores and publish them to students." />
      <WithSection>{(section) => <AssessmentsPanel key={section.id} section={section} />}</WithSection>
    </div>
  )
}
