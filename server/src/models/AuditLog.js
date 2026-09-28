import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AuditLog extends Model {}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER },
    action: { type: DataTypes.STRING(100), allowNull: false },
    entityType: { type: DataTypes.STRING(50) },
    entityId: { type: DataTypes.INTEGER },
    metadata: { type: DataTypes.JSON },
    ipAddress: { type: DataTypes.STRING(64) },
    requestId: { type: DataTypes.STRING(64) },
  },
  { sequelize, modelName: 'AuditLog', tableName: 'audit_logs', updatedAt: false },
);

export default AuditLog;
