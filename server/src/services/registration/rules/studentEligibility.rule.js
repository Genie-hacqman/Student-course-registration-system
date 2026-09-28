import { STUDENT_STATUS } from '../../../utils/constants.js';

const ELIGIBLE = [STUDENT_STATUS.ACTIVE, STUDENT_STATUS.PROBATION];

export const studentEligibility = ({ student }) => {
  const rule = 'STUDENT_ELIGIBILITY';
  if (!ELIGIBLE.includes(student.status)) {
    return { rule, passed: false, message: `Students with status "${student.status}" cannot register` };
  }
  if (student.academicHold) {
    return { rule, passed: false, message: 'Your account has an academic hold. Contact the registrar.' };
  }
  return { rule, passed: true };
};
