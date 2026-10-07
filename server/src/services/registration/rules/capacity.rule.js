export const capacity = ({ section, waitlistOffered = false }) => {
  const rule = 'CAPACITY';
  if (section.seatsTaken < section.capacity) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `${section.course.code} section ${section.sectionCode} is full. ${
      waitlistOffered ? 'You can join the waitlist.' : 'No waitlist is available for this section.'
    }`,
    details: { waitlistAvailable: waitlistOffered, courseSectionId: section.id },
  };
};
