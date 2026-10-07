export const duplicateCourse = ({ section, otherItems }) => {
  const rule = 'DUPLICATE_COURSE';
  const existing = otherItems.find((item) => item.courseId === section.courseId);
  if (!existing) return { rule, passed: true };

  const sameSection = existing.courseSectionId === section.id;
  return {
    rule,
    passed: false,
    message: sameSection
      ? `You are already registered for ${section.course.code}`
      : `You are already registered for another section of ${section.course.code}`,
  };
};
