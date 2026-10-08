'use strict';

const DEFAULTS = [
  { key: 'registration.requireApproval', value: false, description: 'Submitted registrations need registrar approval (off: approved automatically unless the timetable clashes)' },
  { key: 'registration.defaultMaxCredits', value: 24, description: 'Fallback credit limit when semester and program do not set one' },
  { key: 'registration.waitlistEnabled', value: true, description: 'Offer waitlists for full sections (each section can also opt out)' },
  { key: 'grades.passingGrade', value: 'D', description: 'Lowest grade that counts as a pass' },
  { key: 'institution.name', value: 'Student Course Registration System', description: 'Printed on registration slips and shown in the UI' },
  { key: 'institution.studentEmailDomain', value: '', description: 'Domain of admitted students\' school email addresses, e.g. school.edu.gh' },
  { key: 'institution.staffEmailDomain', value: '', description: 'Domain for generated staff school emails (first.last@domain), e.g. staff.school.edu.gh' },
  { key: 'teaching.restrictLecturerDepartment', value: true, description: 'Lecturers may only be assigned to courses of their own department' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    for (const setting of DEFAULTS) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO settings (`key`, value, description, created_at, updated_at) VALUES (:key, :value, :description, :now, :now)',
        { replacements: { ...setting, value: JSON.stringify(setting.value), now } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', { key: DEFAULTS.map((d) => d.key) });
  },
};
