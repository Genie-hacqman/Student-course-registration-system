import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AcademicYear extends Model {}

AcademicYear.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
  },
  { sequelize, modelName: 'AcademicYear', tableName: 'academic_years' },
);

export default AcademicYear;
