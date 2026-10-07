import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class PrerequisiteOverride extends Model {}

PrerequisiteOverride.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER },
    grantedBy: { type: DataTypes.INTEGER },
    reason: { type: DataTypes.STRING(500), allowNull: false },
  },
  { sequelize, modelName: 'PrerequisiteOverride', tableName: 'prerequisite_overrides', updatedAt: false },
);

export default PrerequisiteOverride;
