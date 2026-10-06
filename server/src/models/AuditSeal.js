import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A sealed batch of audit rows in one stream ('main' or 'signin'). seal_hash covers the previous seal's hash
 * and every row's HMAC in the batch, so the seals form a chain. Seals are never deleted; when the rows are
 * archived and purged by the retention job the seal stays, marked with purged_at and the archive key.
 */
class AuditSeal extends Model {}

AuditSeal.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    stream: { type: DataTypes.STRING(10), allowNull: false },
    fromId: { type: DataTypes.INTEGER, allowNull: false },
    toId: { type: DataTypes.INTEGER, allowNull: false },
    rowCount: { type: DataTypes.INTEGER, allowNull: false },
    lastRowAt: { type: DataTypes.DATE, allowNull: false },
    prevSealHash: { type: DataTypes.CHAR(64), allowNull: false },
    sealHash: { type: DataTypes.CHAR(64), allowNull: false },
    archiveKey: { type: DataTypes.STRING(255) },
    purgedAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'AuditSeal', tableName: 'audit_seals', updatedAt: false },
);

export default AuditSeal;
