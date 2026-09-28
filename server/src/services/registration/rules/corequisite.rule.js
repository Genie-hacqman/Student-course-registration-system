import { describeGroup } from '../../prerequisite.service.js';

/**
 * Corequisites (e.g. a lecture and its lab) must be taken together or already passed.
 * Checked on submit only: the two sections are added one at a time, so blocking the first add
 * would make the pair impossible to register. At add time the service returns a warning instead.
 */
export const corequisite = ({ section, requirements }) => {
  const rule = 'COREQUISITE';
  const groups = requirements?.corequisitesMissing ?? [];
  if (!groups.length) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `${section.course.code} must be taken together with ${groups.map(describeGroup).join(' and ')}`,
    details: { groups },
  };
};

export const corequisiteWarnings = (section, requirements) =>
  (requirements?.corequisitesMissing ?? []).map(
    (g) => `Also register ${describeGroup(g)} (corequisite of ${section.course.code}) before submitting`,
  );
