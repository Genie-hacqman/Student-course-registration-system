import { COURSE_STATUS, SECTION_STATUS } from '../../../utils/constants.js';

export const sectionAvailability = ({ section, semester }) => {
  const rule = 'SECTION_AVAILABILITY';
  if (semester && section.semesterId !== semester.id) {
    return { rule, passed: false, message: 'This section is not offered in the current semester' };
  }
  if (section.status !== SECTION_STATUS.OPEN) {
    return { rule, passed: false, message: `This section is ${section.status}` };
  }
  if (section.course.status !== COURSE_STATUS.ACTIVE) {
    return { rule, passed: false, message: `${section.course.code} is not currently offered` };
  }
  return { rule, passed: true };
};
