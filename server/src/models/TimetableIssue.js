import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { TIMETABLE_ISSUE_STATUS, TIMETABLE_ISSUE_TYPES } from '../utils/constants.js';

/** A clash or missing slot found while confirming a registration's timetable on approval (see timetable.service). */
class TimetableIssue extends Model {}

TimetableIssue.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    registrationId: { type: DataTypes.INTEGER, allowNull: false },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM(...TIMETABLE_ISSUE_TYPES), allowNull: false },
    details: { type: DataTypes.JSON },
    status: {
      type: DataTypes.ENUM(...Object.values(TIMETABLE_ISSUE_STATUS)),
      allowNull: false,
      defaultValue: TIMETABLE_ISSUE_STATUS.OPEN,
    },
    detectedBy: { type: DataTypes.INTEGER },
    resolvedBy: { type: DataTypes.INTEGER },
    resolvedAt: { type: DataTypes.DATE },
    resolutionNote: { type: DataTypes.STRING(500) },
  },
  {
    sequelize,
    modelName: 'TimetableIssue',
    tableName: 'timetable_issues',
    indexes: [{ unique: true, fields: ['registration_id', 'course_section_id', 'type'] }],
  },
);

export default TimetableIssue;
