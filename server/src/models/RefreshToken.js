import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class RefreshToken extends Model {
  get isActive() {
    return !this.revokedAt && this.expiresAt > new Date();
  }
}

RefreshToken.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE },
    replacedByHash: { type: DataTypes.STRING(64) },
    accessJti: { type: DataTypes.CHAR(36) },
    accessExpiresAt: { type: DataTypes.DATE },
    userAgent: { type: DataTypes.STRING(255) },
    ipAddress: { type: DataTypes.STRING(64) },
  },
  { sequelize, modelName: 'RefreshToken', tableName: 'refresh_tokens' },
);

export default RefreshToken;
