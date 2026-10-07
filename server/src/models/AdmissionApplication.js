import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { APPLICATION_STATUS } from '../utils/constants.js';

export const photoEditable = (application) => application.status === APPLICATION_STATUS.DRAFT && !application.photoLockedAt;

class AdmissionApplication extends Model {
  toJSON() {
    const values = { ...this.get() };
    const present = Boolean(values.photoKey);
    const { photoUploadedAt, photoLockedAt } = values;
    delete values.photoKey;
    delete values.photoSha256;
    delete values.photoUploadedAt;
    delete values.photoLockedAt;
    return { ...values, photo: { present, uploadedAt: photoUploadedAt ?? null, lockedAt: photoLockedAt ?? null, locked: !photoEditable(this) } };
  }
}

AdmissionApplication.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    personalEmail: { type: DataTypes.STRING(191), allowNull: false, unique: true },
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
    activationEmailSentAt: { type: DataTypes.DATE },
    activationEmailLastAttemptAt: { type: DataTypes.DATE },
    activationEmailAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activationEmailError: { type: DataTypes.STRING(255) },
    accountActivatedAt: { type: DataTypes.DATE },
    photoKey: { type: DataTypes.STRING(255) },
    photoSha256: { type: DataTypes.CHAR(64) },
    photoUploadedAt: { type: DataTypes.DATE },
    photoLockedAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'AdmissionApplication', tableName: 'admission_applications' },
);

export default AdmissionApplication;
