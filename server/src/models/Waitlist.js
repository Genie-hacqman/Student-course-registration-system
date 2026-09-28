import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { WAITLIST_STATUS } from '../utils/constants.js';

class Waitlist extends Model {}

Waitlist.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(WAITLIST_STATUS)),
      allowNull: false,
      defaultValue: WAITLIST_STATUS.WAITING,
    },
    notifiedAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: 'Waitlist',
    tableName: 'waitlists',
    indexes: [{ unique: true, fields: ['student_id', 'course_section_id'] }],
  },
);

export default Waitlist;
