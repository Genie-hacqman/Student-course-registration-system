import { Link } from 'react-router-dom'
import LegalLayout, { LegalSection } from './LegalLayout'
import { SITE } from '../../lib/site'

export default function Terms() {
  return (
    <LegalLayout
      title="Terms and conditions"
      updated="6 October 2026"
      intro={`These terms apply when you use UniReg, the Student Course Registration System operated by ${SITE.institution}. By creating an account or signing in, you agree to them.`}
    >
      <LegalSection title="Your account">
        <ul>
          <li>Keep your password and PIN to yourself. You are responsible for what happens under your account.</li>
          <li>Tell the registry straight away if you think someone else has used your account.</li>
          <li>Give accurate information. Applications and registrations that rely on false information can be rejected or cancelled.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Admission and registration">
        <ul>
          <li>Submitting an application does not guarantee admission. Decisions are made by the institution's staff.</li>
          <li>Course registration is subject to the academic rules the system applies: prerequisites, seat capacity, timetable conflicts, waitlists and registration windows.</li>
          <li>A registration is only confirmed once it is approved. The registry may change or cancel a registration where the academic rules or the institution's regulations require it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <ul>
          <li>Do not try to access other people's accounts or records, or to bypass the system's security or rules.</li>
          <li>Do not upload unlawful content, or a photo that is not of you where your own official photo is required.</li>
          <li>Do not overload the system with automated requests.</li>
        </ul>
        <p>We may suspend an account that breaks these rules.</p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>We work to keep UniReg available, but it may be unavailable from time to time for maintenance or for reasons outside our control. Keep a copy of important documents, such as your registration slip.</p>
      </LegalSection>

      <LegalSection title="Content and ownership">
        <p>UniReg and its design belong to the institution. Academic records and results shown in UniReg are the institution's official records, and the institution's regulations take precedence if anything here conflicts with them.</p>
      </LegalSection>

      <LegalSection title="Your information">
        <p>How we handle personal information is described in our <Link to="/privacy" className="text-brand-600 underline underline-offset-2 hover:text-brand-700">privacy policy</Link>.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>We may update these terms. The date at the top shows when they last changed, and continuing to use UniReg means you accept the updated terms.</p>
      </LegalSection>
    </LegalLayout>
  )
}
