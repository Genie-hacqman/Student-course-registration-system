import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { REGISTRATION_ITEM_STATUS } from '../utils/constants.js';

class RegistrationItem extends Model {}

RegistrationItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    registrationId: { type: DataTypes.INTEGER, allowNull: false },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(REGISTRATION_ITEM_STATUS)),
      allowNull: false,
      defaultValue: REGISTRATION_ITEM_STATUS.REGISTERED,
    },
    droppedAt: { type: DataTypes.DATE },
    addedBy: { type: DataTypes.INTEGER },
    overriddenRules: { type: DataTypes.JSON },
    overrideReason: { type: DataTypes.STRING(500) },
  },
  {
    sequelize,
    modelName: 'RegistrationItem',
    tableName: 'registration_items',
    indexes: [{ unique: true, fields: ['registration_id', 'course_section_id'] }],
  },
);

export default RegistrationItem;
