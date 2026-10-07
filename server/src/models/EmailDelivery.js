import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { EMAIL_STATUS } from '../utils/constants.js';

class EmailDelivery extends Model {}

EmailDelivery.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idempotencyKey: { type: DataTypes.STRING(191), unique: true },
    template: { type: DataTypes.STRING(60), allowNull: false },
    recipient: { type: DataTypes.STRING(191), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    userId: { type: DataTypes.INTEGER },
    entityType: { type: DataTypes.STRING(50) },
    entityId: { type: DataTypes.INTEGER },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    providerMessageId: { type: DataTypes.STRING(100) },
    status: { type: DataTypes.ENUM(...Object.values(EMAIL_STATUS)), allowNull: false },
    error: { type: DataTypes.STRING(255) },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    lastEventAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'EmailDelivery', tableName: 'email_deliveries' },
);

export default EmailDelivery;
