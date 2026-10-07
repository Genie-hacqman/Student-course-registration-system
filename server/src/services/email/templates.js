export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const e = escapeHtml;

const BRAND = '#1d4ed8';

const layout = ({ school, greeting, paragraphs = [], rows = [], action, note, footer }) => {
  const cell = 'padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:${BRAND};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;">${e(school)}</td></tr>
  <tr><td style="padding:28px;">
    ${greeting ? `<p style="margin:0 0 12px;font-size:16px;">${e(greeting)}</p>` : ''}
    ${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${e(p)}</p>`).join('')}
    ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
      ${rows.map(([k, v]) => `<tr><td style="${cell}color:#64748b;width:40%;">${e(k)}</td><td style="${cell}font-weight:bold;">${e(v)}</td></tr>`).join('')}
    </table>` : ''}
    ${action ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:6px;background:${BRAND};">
      <a href="${e(action.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${e(action.label)}</a>
    </td></tr></table>
    <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.5;">If the button doesn't work, copy this address into your browser:<br><span style="word-break:break-all;color:${BRAND};">${e(action.url)}</span></p>` : ''}
    ${note ? `<p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.5;">${e(note)}</p>` : ''}
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.5;">${e(footer ?? `This is an automated message from ${school}. Please don't reply to it.`)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    greeting,
    ...paragraphs,
    rows.length ? rows.map(([k, v]) => `${k}: ${v}`).join('\n') : null,
    action ? `${action.label}: ${action.url}` : null,
    note,
    `—\n${footer ?? `This is an automated message from ${school}. Please don't reply to it.`}`,
  ].filter(Boolean).join('\n\n');
  return { html, text };
};

const make = (subject, parts, ctx) => ({ subject, ...layout({ school: ctx.school, ...parts }) });
const link = (ctx, path) => `${ctx.frontendUrl}${path}`;
const hello = (name) => (name ? `Dear ${name},` : 'Hello,');

export const accountActivation = ({
  name, studentNumber, programName, departmentName, level, schoolEmail, activationUrl, hours,
}, ctx) => make(`Admission to ${ctx.school}: activate your student account`, {
  greeting: hello(name),
  paragraphs: [`Congratulations! You have been admitted to ${ctx.school}. Your student record is ready:`],
  rows: [
    ['Student ID', studentNumber],
    ['Programme', programName],
    ...(departmentName ? [['Department', departmentName]] : []),
    ['Level', level],
    ['School email', schoolEmail],
  ],
  action: { label: 'Activate Student Account', url: activationUrl },
  note: `This link works once and expires in ${hours} hours. After activating, sign in with your Student ID and the PIN you choose. If the link has expired or was already used, contact the admissions office for a new one. If you didn't apply for admission, you can ignore this email.`,
}, ctx);

export const applicationDecision = ({ name, reason }, ctx) => make(`Your application to ${ctx.school}`, {
  greeting: hello(name),
  paragraphs: [
    `Thank you for applying to ${ctx.school}. We're sorry — your application for admission was not successful.`,
    ...(reason ? [`Reason: ${reason}`] : []),
  ],
  action: { label: 'View your application', url: link(ctx, '/student/admission') },
}, ctx);

export const emailVerification = ({ name, verifyUrl, hours }, ctx) => make('Confirm your email address', {
  greeting: hello(name),
  paragraphs: [`Please confirm this email address for your ${ctx.school} account. We use it for your admission decision and account security messages.`],
  action: { label: 'Confirm email address', url: verifyUrl },
  note: `This link works once and expires in ${hours} hours. If you didn't create an account, you can ignore this email.`,
}, ctx);

export const staffInvite = ({ name, email, setPasswordUrl, hours }, ctx) => make(`Your ${ctx.school} account`, {
  greeting: hello(name),
  paragraphs: [`An account has been created for you on ${ctx.school}. Choose your password to activate it, then sign in with ${email}.`],
  action: { label: 'Set your password', url: setPasswordUrl },
  note: `This link works once and expires in ${hours} hours. If it has expired, ask the administrator to send a new invite.`,
}, ctx);

export const passwordResetRequest = ({ name, resetUrl, minutes, approved }, ctx) => make('Reset your password', {
  greeting: hello(name),
  paragraphs: [approved
    ? 'Your password reset request was approved. Use the button below to choose a new password.'
    : 'We received a request to reset your password. Use the button below to choose a new one.'],
  action: { label: 'Choose a new password', url: resetUrl },
  note: `This link works once and expires in ${minutes} minutes. If you didn't request this, you can ignore this email — your password has not changed.`,
}, ctx);

const securityNote = (ctx) => `If this wasn't you, reset your password right away and contact the ${ctx.school} administrator.`;

export const passwordResetCompleted = ({ name, when }, ctx) => make('Your password was reset', {
  greeting: hello(name),
  paragraphs: [`The password for your ${ctx.school} account was reset on ${when}. You've been signed out on every device.`],
  note: securityNote(ctx),
}, ctx);

export const passwordChanged = ({ name, when }, ctx) => make('Your password was changed', {
  greeting: hello(name),
  paragraphs: [`The password for your ${ctx.school} account was changed on ${when}. Other devices were signed out.`],
  note: securityNote(ctx),
}, ctx);

export const pinChanged = ({ name, when, recovered }, ctx) => make(recovered ? 'Your PIN was reset' : 'Your PIN was changed', {
  greeting: hello(name),
  paragraphs: [`The sign-in PIN for your ${ctx.school} student account was ${recovered ? 'reset with a one-time code' : 'changed'} on ${when}. Other devices were signed out.`],
  note: `If this wasn't you, use "Forgot PIN" on the sign-in page right away and contact the registry.`,
}, ctx);

export const pinResetCode = ({ studentNumber, code, minutes }, ctx) => make(`Your ${ctx.school} PIN reset code`, {
  paragraphs: [`Your code to reset the PIN for ${studentNumber} is:`, code],
  note: `It expires in ${minutes} minutes and works once. If you didn't ask to reset your PIN, ignore this email; your PIN has not changed.`,
}, ctx);

export const registrationSubmitted = ({ name, reference, semester, credits, needsApproval }, ctx) => make('Course registration submitted', {
  greeting: hello(name),
  paragraphs: [needsApproval
    ? 'Your course registration has been submitted and is waiting for the registrar\'s approval. We\'ll email you when it has been reviewed.'
    : 'Your course registration has been submitted and confirmed.'],
  rows: [['Reference', reference ?? '—'], ['Semester', semester ?? '—'], ['Credits', credits ?? '—']],
  action: { label: 'View your registration', url: link(ctx, '/student/my-courses') },
}, ctx);

export const registrationDecision = ({ name, approved, reason, auto, reference, semester, credits }, ctx) => make(approved ? 'Registration approved' : 'Registration needs changes', {
  greeting: hello(name),
  paragraphs: approved
    ? [auto
      ? 'Your course registration was submitted and approved automatically, and your timetable is confirmed.'
      : 'Your course registration has been approved and your timetable is confirmed.']
    : ['Your course registration was not approved. Please update it and submit it again.', ...(reason ? [`Reason: ${reason}`] : [])],
  rows: auto ? [['Reference', reference ?? '—'], ['Semester', semester ?? '—'], ['Credits', credits ?? '—']] : undefined,
  action: approved
    ? { label: 'View your timetable', url: link(ctx, '/student/timetable') }
    : { label: 'Update your registration', url: link(ctx, '/student/registration') },
}, ctx);

export const timetableChange = ({ name, title, message }, ctx) => make(title, {
  greeting: hello(name),
  paragraphs: [message],
  action: { label: 'Open your timetable', url: link(ctx, '/') },
}, ctx);

export const announcement = ({ name, title, body, author }, ctx) => make(title, {
  greeting: hello(name),
  paragraphs: String(body ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
  note: author ? `Posted by ${author}.` : undefined,
  action: { label: 'Open announcements', url: link(ctx, '/') },
}, ctx);

export const adminAlert = ({ title, message, path }, ctx) => make(title, {
  paragraphs: [message],
  action: path ? { label: 'Open in the admin area', url: link(ctx, path) } : undefined,
  footer: `You receive this as an administrator of ${ctx.school}.`,
}, ctx);

export const notification = ({ name, title, message }, ctx) => make(title, {
  greeting: hello(name),
  paragraphs: [message],
  action: { label: `Open ${ctx.school}`, url: link(ctx, '/') },
}, ctx);
