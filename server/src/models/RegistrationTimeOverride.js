import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/** An individual student's registration start time for a semester; beats any priority window. */
class RegistrationTimeOverride extends Model {}

RegistrationTimeOverride.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    opensAt: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    grantedBy: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'RegistrationTimeOverride',
    tableName: 'registration_time_overrides',
    indexes: [{ unique: true, fields: ['student_id', 'semester_id'] }],
  },
);

export default RegistrationTimeOverride;
