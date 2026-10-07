import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

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
