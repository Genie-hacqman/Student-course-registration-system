import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Result extends Model {}

Result.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER },
    courseSectionId: { type: DataTypes.INTEGER },
    grade: { type: DataTypes.STRING(5), allowNull: false },
    gradePoint: { type: DataTypes.DECIMAL(3, 2) },
    passed: { type: DataTypes.BOOLEAN, allowNull: false },
    status: { type: DataTypes.ENUM('provisional', 'final'), allowNull: false, defaultValue: 'final' },
    enteredBy: { type: DataTypes.INTEGER },
    finalizedAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: 'Result',
    tableName: 'results',
    indexes: [{ unique: true, fields: ['student_id', 'course_id', 'semester_id'] }],
  },
);

export default Result;
