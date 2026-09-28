import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Role extends Model {}

Role.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255) },
  },
  { sequelize, modelName: 'Role', tableName: 'roles' },
);

export default Role;
