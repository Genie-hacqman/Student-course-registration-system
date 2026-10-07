export const semesterEligibility = ({ section, semester, curriculum }) => {
  const rule = 'SEMESTER_ELIGIBILITY';
  if (!curriculum) return { rule, passed: true };
  if (curriculum.semester && semester?.term && curriculum.semester !== semester.term) {
    return {
      rule,
      passed: false,
      message: `${section.course.code} is taught in semester ${curriculum.semester} of your programme; this is semester ${semester.term}`,
    };
  }
  if (curriculum.notYetInEffect) {
    return {
      rule,
      passed: false,
      message: `${section.course.code} is on your programme's curriculum from ${curriculum.effectiveYear}`,
    };
  }
  return { rule, passed: true };
};
