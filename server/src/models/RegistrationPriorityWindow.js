import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/** Students matching (level >= minLevel, and programId if set) may start registering at opensAt. */
class RegistrationPriorityWindow extends Model {}

RegistrationPriorityWindow.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    minLevel: { type: DataTypes.INTEGER },
    programId: { type: DataTypes.INTEGER },
    opensAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'RegistrationPriorityWindow', tableName: 'registration_priority_windows' },
);

export default RegistrationPriorityWindow;
