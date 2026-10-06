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
    userAgent: { type: DataTypes.STRING(255) },
    // Who acted, as they were when it happened: survives the user being deleted (user_id is then cleared).
    actorEmail: { type: DataTypes.STRING(255) },
    actorRole: { type: DataTypes.STRING(30) },
    rowHmac: { type: DataTypes.CHAR(64) },
  },
  { sequelize, modelName: 'AuditLog', tableName: 'audit_logs', updatedAt: false },
);

// The log is append-only through the application. The one sanctioned way to remove rows is the retention
// job in audit-maintenance.service.js, which archives them first and deletes with raw SQL on purpose.
const refuse = () => { throw new Error('audit_logs is append-only'); };
AuditLog.addHook('beforeUpdate', refuse);
AuditLog.addHook('beforeDestroy', refuse);
AuditLog.addHook('beforeBulkUpdate', refuse);
AuditLog.addHook('beforeBulkDestroy', refuse);
AuditLog.addHook('beforeUpsert', refuse);

export default AuditLog;
