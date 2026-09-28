/**
 * Changes are allowed from the student's own opening time (priority window / override,
 * precomputed as `opensAt`; defaults to the semester's registrationStart) until registration closes.
 * After a student has submitted, they may keep adding/dropping until the add/drop deadline.
 */
export const registrationWindow = ({ semester, registration, now, opensAt, priority }) => {
  const rule = 'REGISTRATION_WINDOW';
  if (!semester) return { rule, passed: false, message: 'There is no active semester' };

  const start = opensAt ?? semester.registrationStart;
  const closesAt = semester.registrationEnd;
  const addDropEnd = semester.addDropEnd ?? closesAt;

  if (now >= start && now <= closesAt) return { rule, passed: true };
  if (registration?.submittedAt && now >= start && now <= addDropEnd) return { rule, passed: true };

  if (now < start) {
    const slot = priority?.windowName ? ` (${priority.windowName})` : '';
    return {
      rule,
      passed: false,
      message: `Your registration for ${semester.name} opens on ${new Date(start).toISOString()}${slot}`,
      details: { opensAt: start },
    };
  }
  return { rule, passed: false, message: `Registration for ${semester.name} is closed` };
};
