import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { USER_STATUS } from '../utils/constants.js';

const SECRETS = [
  'passwordHash', 'passwordResetHash', 'passwordResetExpires', 'emailVerificationHash', 'emailVerificationExpires',
  'pinOtpHash', 'pinOtpExpires', 'pinOtpAttempts', 'pinOtpSentAt', 'failedLoginAttempts', 'lockedUntil',
  'activationHash', 'activationExpires',
];

// Pictures are tens of KB each, so they stay out of the many name-only user includes; `withAvatar` opts in.
const AVATAR = ['avatar'];

class User extends Model {
  toJSON() {
    const values = { ...this.get() };
    for (const key of [...SECRETS, 'tokenVersion']) delete values[key];
    return values;
  }
}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    email: {
      type: DataTypes.STRING(191),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('email', String(value).trim().toLowerCase());
      },
    },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(USER_STATUS)),
      allowNull: false,
      defaultValue: USER_STATUS.ACTIVE,
    },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    emailVerifiedAt: { type: DataTypes.DATE },
    emailVerificationHash: { type: DataTypes.STRING(64) },
    emailVerificationExpires: { type: DataTypes.DATE },
    passwordResetHash: { type: DataTypes.STRING(64) },
    passwordResetExpires: { type: DataTypes.DATE },
    lastLoginAt: { type: DataTypes.DATE },
    // Set on admission and staff PIN resets: every route except changing the PIN is refused until it's cleared.
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE },
    pinOtpHash: { type: DataTypes.CHAR(64) },
    pinOtpExpires: { type: DataTypes.DATE },
    pinOtpAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    pinOtpSentAt: { type: DataTypes.DATE },
    // Online admission: single-use activation link (sha256 of the token), cleared once used.
    activationHash: { type: DataTypes.CHAR(64) },
    activationExpires: { type: DataTypes.DATE },
    avatar: { type: DataTypes.TEXT('medium') },
    avatarUpdatedAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    defaultScope: { attributes: { exclude: [...SECRETS, ...AVATAR] } },
    scopes: {
      withSecrets: { attributes: { include: [...SECRETS] } },
      withAvatar: { attributes: { exclude: [...SECRETS] } },
    },
  },
);

export default User;
