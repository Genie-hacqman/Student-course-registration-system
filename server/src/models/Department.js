import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ORG_STATUS } from '../utils/constants.js';

class Department extends Model {}

Department.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM(...Object.values(ORG_STATUS)), allowNull: false, defaultValue: ORG_STATUS.ACTIVE },
  },
  { sequelize, modelName: 'Department', tableName: 'departments' },
);

export default Department;
