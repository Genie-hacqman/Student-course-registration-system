import { sequelize, Setting } from '../models/index.js';
import * as audit from './audit.service.js';

export const DEFAULTS = Object.freeze({
  'registration.requireApproval': true,
  'registration.defaultMaxCredits': 24,
  'registration.waitlistEnabled': true,
  'grades.passingGrade': 'D',
  'institution.name': 'Student Course Registration System',
  'institution.studentEmailDomain': '',
});

export const list = () => Setting.findAll({ order: [['key', 'ASC']] });

export const get = async (key, { transaction } = {}) => {
  const setting = await Setting.findOne({ where: { key }, transaction });
  return setting ? setting.value : DEFAULTS[key];
};

export const upsertMany = async (settings, actor) => {
  await sequelize.transaction(async (transaction) => {
    for (const { key, value, description } of settings) {
      const [setting, created] = await Setting.findOrCreate({
        where: { key },
        defaults: { key, value, description },
        transaction,
      });
      if (!created) await setting.update({ value, ...(description ? { description } : {}) }, { transaction });
    }
    await audit.log({ userId: actor.id, action: 'settings.update', entityType: 'Setting', metadata: { keys: settings.map((s) => s.key) }, transaction });
  });
  return list();
};
