import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ASSIGNMENT_STATUS } from '../utils/constants.js';

class SectionLecturerAssignment extends Model {}

SectionLecturerAssignment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    lecturerId: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(ASSIGNMENT_STATUS)),
      allowNull: false,
      defaultValue: ASSIGNMENT_STATUS.ACTIVE,
    },
    assignedBy: { type: DataTypes.INTEGER },
    assignedAt: { type: DataTypes.DATE, allowNull: false },
    endedBy: { type: DataTypes.INTEGER },
    endedAt: { type: DataTypes.DATE },
    endReason: { type: DataTypes.STRING(255) },
  },
  { sequelize, modelName: 'SectionLecturerAssignment', tableName: 'section_lecturer_assignments' },
);

export default SectionLecturerAssignment;
