import { sequelize, Setting } from '../models/index.js';
import * as audit from './audit.service.js';

export const DEFAULTS = Object.freeze({
  'registration.requireApproval': false,
  'registration.defaultMaxCredits': 24,
  'registration.waitlistEnabled': true,
  'grades.passingGrade': 'D',
  'institution.name': 'Student Course Registration System',
  'institution.studentEmailDomain': '',
  'institution.staffEmailDomain': '',
  'teaching.restrictLecturerDepartment': true,
});

export const list = () => Setting.findAll({ order: [['key', 'ASC']] });

export const get = async (key, { transaction } = {}) => {
  const setting = await Setting.findOne({ where: { key }, transaction });
  return setting ? setting.value : DEFAULTS[key];
};

export const upsertMany = async (settings, actor) => {
  await sequelize.transaction(async (transaction) => {
    const changes = {};
    for (const { key, value, description } of settings) {
      const [setting, created] = await Setting.findOrCreate({
        where: { key },
        defaults: { key, value, description },
        transaction,
      });
      const from = created ? DEFAULTS[key] ?? null : setting.value;
      if (!created) await setting.update({ value, ...(description ? { description } : {}) }, { transaction });
      if (JSON.stringify(from ?? null) !== JSON.stringify(value ?? null)) changes[key] = { from: from ?? null, to: value };
    }
    await audit.log({
      userId: actor.id, action: 'settings.update', entityType: 'Setting', transaction,
      metadata: { keys: settings.map((s) => s.key), changes },
    });
  });
  return list();
};
