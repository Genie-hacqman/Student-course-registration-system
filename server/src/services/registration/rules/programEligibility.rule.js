/** The course must be on the student's program curriculum (program_courses). `inProgram` is precomputed. */
export const programEligibility = ({ section, inProgram, programName }) => {
  const rule = 'PROGRAM_ELIGIBILITY';
  if (inProgram) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `${section.course.code} is not part of your program${programName ? ` (${programName})` : ''}`,
  };
};
