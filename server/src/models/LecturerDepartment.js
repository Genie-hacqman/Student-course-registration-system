import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class LecturerDepartment extends Model {}

LecturerDepartment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lecturerId: { type: DataTypes.INTEGER, allowNull: false },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: 'LecturerDepartment',
    tableName: 'lecturer_departments',
    indexes: [{ unique: true, fields: ['lecturer_id', 'department_id'], name: 'lecturer_departments_unique' }],
  },
);

export default LecturerDepartment;
