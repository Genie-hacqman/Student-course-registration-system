import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Lecturer extends Model {}

Lecturer.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
    staffNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(50) },
  },
  { sequelize, modelName: 'Lecturer', tableName: 'lecturers' },
);

export default Lecturer;
