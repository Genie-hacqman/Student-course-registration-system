import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AttendanceSession extends Model {}

AttendanceSession.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    scheduleId: { type: DataTypes.INTEGER },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    topic: { type: DataTypes.STRING(200) },
    takenBy: { type: DataTypes.INTEGER },
  },
  { sequelize, modelName: 'AttendanceSession', tableName: 'attendance_sessions' },
);

export default AttendanceSession;
