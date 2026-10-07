import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { REGISTRATION_STATUS } from '../utils/constants.js';

class Registration extends Model {}

Registration.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    referenceNumber: { type: DataTypes.STRING(30), unique: true },
    status: {
      type: DataTypes.ENUM(...Object.values(REGISTRATION_STATUS)),
      allowNull: false,
      defaultValue: REGISTRATION_STATUS.DRAFT,
    },
    totalCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    submittedAt: { type: DataTypes.DATE },
    reviewedAt: { type: DataTypes.DATE },
    reviewedBy: { type: DataTypes.INTEGER },
    timetableConfirmedAt: { type: DataTypes.DATE },
    remarks: { type: DataTypes.STRING(500) },
  },
  {
    sequelize,
    modelName: 'Registration',
    tableName: 'registrations',
    indexes: [{ unique: true, fields: ['student_id', 'semester_id'] }],
  },
);

export default Registration;
