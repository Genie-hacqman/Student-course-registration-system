import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { APPLICATION_STATUS } from '../utils/constants.js';

/** An applicant's online admission application (one per account; see application.service). */
class AdmissionApplication extends Model {}

AdmissionApplication.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    personalEmail: { type: DataTypes.STRING(191), allowNull: false },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    otherNames: { type: DataTypes.STRING(100) },
    dateOfBirth: { type: DataTypes.DATEONLY },
    phone: { type: DataTypes.STRING(30) },
    departmentId: { type: DataTypes.INTEGER },
    programId: { type: DataTypes.INTEGER },
    entryLevel: { type: DataTypes.INTEGER },
    admissionSession: { type: DataTypes.STRING(9) },
    status: {
      type: DataTypes.ENUM(...Object.values(APPLICATION_STATUS)),
      allowNull: false,
      defaultValue: APPLICATION_STATUS.DRAFT,
    },
    submittedAt: { type: DataTypes.DATE },
    reviewedBy: { type: DataTypes.INTEGER },
    reviewedAt: { type: DataTypes.DATE },
    rejectionReason: { type: DataTypes.STRING(500) },
    studentId: { type: DataTypes.INTEGER, unique: true },
  },
  { sequelize, modelName: 'AdmissionApplication', tableName: 'admission_applications' },
);

export default AdmissionApplication;
