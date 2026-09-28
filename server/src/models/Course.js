import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { COURSE_STATUS } from '../utils/constants.js';

class Course extends Model {}

Course.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('code', String(value).trim().toUpperCase());
      },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    level: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(COURSE_STATUS)),
      allowNull: false,
      defaultValue: COURSE_STATUS.ACTIVE,
    },
  },
  { sequelize, modelName: 'Course', tableName: 'courses' },
);

export default Course;
