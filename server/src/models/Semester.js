import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { SEMESTER_STATUS } from '../utils/constants.js';

class Semester extends Model {
  isRegistrationOpen(now = new Date()) {
    return now >= this.registrationStart && now <= this.registrationEnd;
  }

  isAddDropOpen(now = new Date()) {
    return now >= this.registrationStart && now <= (this.addDropEnd ?? this.registrationEnd);
  }
}

Semester.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false },
    term: { type: DataTypes.TINYINT },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    registrationStart: { type: DataTypes.DATE, allowNull: false },
    registrationEnd: { type: DataTypes.DATE, allowNull: false },
    addDropEnd: { type: DataTypes.DATE },
    maxCredits: { type: DataTypes.INTEGER },
    minCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: {
      type: DataTypes.ENUM(...Object.values(SEMESTER_STATUS)),
      allowNull: false,
      defaultValue: SEMESTER_STATUS.UPCOMING,
    },
  },
  { sequelize, modelName: 'Semester', tableName: 'semesters' },
);

export default Semester;
