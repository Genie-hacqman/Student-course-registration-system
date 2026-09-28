import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Program extends Model {}

Program.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    durationYears: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    maxCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 24 },
    qualificationCode: { type: DataTypes.STRING(20) }, // e.g. "BSC"; shown on every student's profile
  },
  { sequelize, modelName: 'Program', tableName: 'programs' },
);

export default Program;
