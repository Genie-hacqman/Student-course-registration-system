export const levelEligibility = ({ student, section }) => {
  const rule = 'LEVEL_ELIGIBILITY';
  if (section.course.level <= student.level) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `${section.course.code} is a level ${section.course.level} course; you are level ${student.level}`,
  };
};
