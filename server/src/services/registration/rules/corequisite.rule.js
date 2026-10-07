import { describeGroup } from '../../prerequisite.service.js';

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
