export const creditLimit = ({ section, otherItems, maxCredits }) => {
  const rule = 'CREDIT_LIMIT';
  const current = otherItems.reduce((sum, item) => sum + item.credits, 0);
  const total = current + section.course.credits;
  if (total <= maxCredits) return { rule, passed: true };
  return {
    rule,
    passed: false,
    message: `Adding ${section.course.code} (${section.course.credits} credits) would bring you to ${total} credits; the maximum is ${maxCredits}`,
    details: { currentCredits: current, maxCredits },
  };
};
