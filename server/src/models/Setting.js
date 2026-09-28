import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Setting extends Model {}

Setting.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    value: { type: DataTypes.JSON },
    description: { type: DataTypes.STRING(255) },
  },
  { sequelize, modelName: 'Setting', tableName: 'settings' },
);

export default Setting;
