import { describeGroup, flattenGroups } from '../../prerequisite.service.js';

/**
 * `requirements` is precomputed by prerequisite.service.evaluateRequirements:
 * { missing: [{ anyOf: [course], minGrade }], corequisitesMissing, overridden }.
 */
export const prerequisite = ({ section, requirements }) => {
  const rule = 'PREREQUISITE';
  const groups = requirements?.missing ?? [];
  if (!groups.length) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `${section.course.code} requires: ${groups.map(describeGroup).join(' and ')}`,
    details: { missing: flattenGroups(groups), groups },
  };
};
