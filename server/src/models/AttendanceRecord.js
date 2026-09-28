import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ATTENDANCE_STATUS } from '../utils/constants.js';

class AttendanceRecord extends Model {}

AttendanceRecord.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    attendanceSessionId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(ATTENDANCE_STATUS)),
      allowNull: false,
      defaultValue: ATTENDANCE_STATUS.PRESENT,
    },
    remark: { type: DataTypes.STRING(255) },
  },
  {
    sequelize,
    modelName: 'AttendanceRecord',
    tableName: 'attendance_records',
    indexes: [{ unique: true, fields: ['attendance_session_id', 'student_id'] }],
  },
);

export default AttendanceRecord;
