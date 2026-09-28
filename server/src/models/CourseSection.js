import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { SECTION_STATUS } from '../utils/constants.js';

class CourseSection extends Model {
  get seatsAvailable() {
    return Math.max(this.capacity - this.seatsTaken, 0);
  }
}

CourseSection.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    lecturerId: { type: DataTypes.INTEGER },
    sectionCode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'A' },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    seatsTaken: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM(...Object.values(SECTION_STATUS)),
      allowNull: false,
      defaultValue: SECTION_STATUS.OPEN,
    },
    waitlistEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'CourseSection',
    tableName: 'course_sections',
    indexes: [{ unique: true, fields: ['course_id', 'semester_id', 'section_code'] }],
  },
);

export default CourseSection;
