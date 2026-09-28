import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/** An admin's change to a role's default permissions: granted = true adds one, false removes one. */
class RolePermissionOverride extends Model {}

RolePermissionOverride.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    permission: { type: DataTypes.STRING(50), allowNull: false },
    granted: { type: DataTypes.BOOLEAN, allowNull: false },
    updatedBy: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'RolePermissionOverride',
    tableName: 'role_permission_overrides',
    indexes: [{ unique: true, fields: ['role_id', 'permission'] }],
  },
);

export default RolePermissionOverride;
