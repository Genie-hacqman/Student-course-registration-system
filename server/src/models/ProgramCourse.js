import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/** A course on a program's curriculum. Students may only register for courses on their program's list. */
class ProgramCourse extends Model {}

ProgramCourse.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    programId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('core', 'elective'), allowNull: false, defaultValue: 'core' },
    recommendedLevel: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'ProgramCourse',
    tableName: 'program_courses',
    indexes: [{ unique: true, fields: ['program_id', 'course_id'] }],
  },
);

export default ProgramCourse;
