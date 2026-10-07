import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class ProgramCourse extends Model {}

ProgramCourse.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    programId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('core', 'elective'), allowNull: false, defaultValue: 'core' },
    recommendedLevel: { type: DataTypes.INTEGER },
    semester: { type: DataTypes.TINYINT },
    academicYearId: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'ProgramCourse',
    tableName: 'program_courses',
    indexes: [{ unique: true, fields: ['program_id', 'course_id'] }],
  },
);

export default ProgramCourse;
