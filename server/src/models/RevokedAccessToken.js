import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/** An access token (by its jti) revoked before its natural expiry, e.g. on logout. */
class RevokedAccessToken extends Model {}

RevokedAccessToken.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    jti: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'RevokedAccessToken', tableName: 'revoked_access_tokens', updatedAt: false },
);

export default RevokedAccessToken;
