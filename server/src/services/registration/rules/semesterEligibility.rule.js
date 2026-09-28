/**
 * The curriculum entry may pin a course to one term of the year (program_courses.semester) and to an
 * academic year it takes effect from. `curriculum` is precomputed by the service:
 * `{ semester, effectiveYear, notYetInEffect }`, or null when the course isn't on the programme
 * (programEligibility reports that). Unset values never restrict anything.
 */
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
