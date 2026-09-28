import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class CoursePrerequisite extends Model {}

CoursePrerequisite.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    prerequisiteCourseId: { type: DataTypes.INTEGER, allowNull: false },
    // Rows sharing a non-null (courseId, type, groupNo) are alternatives (any one satisfies the group);
    // a null groupNo makes the row a group on its own. Every group is required.
    type: { type: DataTypes.ENUM('prerequisite', 'corequisite'), allowNull: false, defaultValue: 'prerequisite' },
    minGrade: { type: DataTypes.STRING(2) },
    groupNo: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'CoursePrerequisite',
    tableName: 'course_prerequisites',
    indexes: [{ unique: true, fields: ['course_id', 'prerequisite_course_id'] }],
  },
);

export default CoursePrerequisite;
