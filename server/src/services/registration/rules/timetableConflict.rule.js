import { slotsOverlap } from '../../../utils/time.js';

export const timetableConflict = ({ section, otherItems }) => {
  const rule = 'TIMETABLE_CONFLICT';
  const clashes = [];
  const conflicting = new Map();

  for (const item of otherItems) {
    if (item.courseSectionId === section.id) continue;
    const other = item.section.course;
    for (const mine of section.schedules) {
      for (const theirs of item.section.schedules) {
        if (!slotsOverlap(mine, theirs)) continue;
        clashes.push({
          courseId: item.courseId,
          courseSectionId: item.courseSectionId,
          course: other.code,
          courseTitle: other.title,
          day: theirs.day,
          startTime: theirs.startTime,
          endTime: theirs.endTime,
        });
        conflicting.set(item.courseSectionId, {
          courseId: item.courseId,
          code: other.code,
          title: other.title,
          courseSectionId: item.courseSectionId,
        });
      }
    }
  }

  if (!clashes.length) return { rule, passed: true };
  const conflictingCourses = [...conflicting.values()];
  return {
    rule,
    passed: false,
    message: `${section.course.code} clashes with ${conflictingCourses.map((c) => c.code).join(', ')}`,
    details: { conflictingCourses, clashes },
  };
};
