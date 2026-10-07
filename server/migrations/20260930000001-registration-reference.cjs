'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('registrations', 'reference_number', {
      type: Sequelize.STRING(30),
      after: 'semester_id',
    });
    await queryInterface.addConstraint('registrations', {
      fields: ['reference_number'],
      type: 'unique',
      name: 'registrations_reference_number_unique',
    });
    await queryInterface.sequelize.query(`
      UPDATE registrations
         SET reference_number = CONCAT('REG-', YEAR(COALESCE(submitted_at, created_at)), '-',
                                       LPAD(semester_id, 2, '0'), '-', LPAD(id, 6, '0'))
       WHERE submitted_at IS NOT NULL AND reference_number IS NULL`);
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('registrations', 'registrations_reference_number_unique');
    await queryInterface.removeColumn('registrations', 'reference_number');
  },
};
