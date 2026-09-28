import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { DAYS } from '../utils/constants.js';

class Schedule extends Model {}

Schedule.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    day: { type: DataTypes.ENUM(...DAYS), allowNull: false },
    startTime: { type: DataTypes.TIME, allowNull: false },
    endTime: { type: DataTypes.TIME, allowNull: false },
    room: { type: DataTypes.STRING(50) },
  },
  { sequelize, modelName: 'Schedule', tableName: 'schedules' },
);

export default Schedule;
