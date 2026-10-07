import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { STUDENT_STATUS } from '../utils/constants.js';

class Student extends Model {}

Student.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    programId: { type: DataTypes.INTEGER, allowNull: false },
    studentNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    admissionYear: { type: DataTypes.INTEGER },
    admissionSession: { type: DataTypes.STRING(9) },
    admissionNumber: { type: DataTypes.STRING(30), unique: true },
    status: {
      type: DataTypes.ENUM(...Object.values(STUDENT_STATUS)),
      allowNull: false,
      defaultValue: STUDENT_STATUS.ACTIVE,
    },
    academicHold: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: 'Student', tableName: 'students' },
);

export default Student;
