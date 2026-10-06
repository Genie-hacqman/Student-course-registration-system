import LegalLayout, { LegalSection } from './LegalLayout'
import { SITE } from '../../lib/site'

/**
 * Describes what UniReg actually stores and sets (see the server models and client/src/lib/monitoring.js).
 * Keep it true to the code: when a new cookie, tracker or provider is added, this page changes with it.
 */
export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy policy"
      updated="6 October 2026"
      intro={`This policy explains what personal information UniReg, the Student Course Registration System, collects, why, and what you can do about it. UniReg is operated by ${SITE.institution}.`}
    >
      <LegalSection title="What we collect">
        <ul>
          <li><strong>Account details:</strong> your name, email address and student ID. Passwords and PINs are stored only in scrambled (hashed) form, so nobody at the institution can read them.</li>
          <li><strong>Application details</strong>, if you apply for admission: your names, date of birth, phone number, chosen programme and entry level, and the official photo you upload.</li>
          <li><strong>Academic records:</strong> your course registrations, waitlist places, timetable, attendance, assessment scores and results.</li>
          <li><strong>Security records:</strong> when and from where you signed in (IP address and browser details), and a log of important actions taken in the system.</li>
          <li><strong>Messages:</strong> notifications and announcements sent to you, and a record of whether the emails we send you were delivered.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>To process admission applications and run course registration, teaching, attendance and grading.</li>
          <li>To keep accounts secure, detect misuse and keep an audit trail of decisions.</li>
          <li>To contact you about your application, registration, results and account.</li>
        </ul>
        <p>We do not sell your information and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>UniReg sets <strong>one cookie</strong>, and it is essential: a secure, HTTP-only sign-in cookie that keeps you signed in for up to 7 days and cannot be read by page scripts. Without it you would have to sign in again on every visit.</p>
        <p>Your browser's local storage also remembers two small display choices: whether the side menu is collapsed and which sign-in tab you last used. These never leave your device.</p>
        <p>We set no advertising, analytics or tracking cookies, so there is no cookie banner to accept.</p>
      </LegalSection>

      <LegalSection title="Who handles it for us">
        <p>Staff can see only what their role allows. We also use a small number of service providers to run UniReg:</p>
        <ul>
          <li>Website and server hosting providers, and a managed database provider (Aiven), which store your records.</li>
          <li>Cloudflare R2, which stores application photos privately.</li>
          <li>Resend, which delivers our emails.</li>
          <li>Sentry, which receives error reports when the app crashes. We configure it to leave out personal details and to remove tokens from web addresses.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>We keep information for as long as it is needed for the purposes above and for the institution's record-keeping obligations. Academic records are normally kept as part of a student's permanent record.</p>
        <p>Security records are kept for a fixed time: sign-in records (including IP address and browser details) for 12 months, and the log of other important actions for 24 months. After that they are moved to a private archive that only the institution's administrators can reach, and removed from the live system.</p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>You can ask to see the personal information we hold about you, to have mistakes corrected, and, where the law and our record-keeping duties allow, to have it deleted. You can update some details yourself under Profile and Settings. For anything else, contact the registry using the details below.</p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>If we change how UniReg handles personal information, we will update this page and the date at the top.</p>
      </LegalSection>
    </LegalLayout>
  )
}
