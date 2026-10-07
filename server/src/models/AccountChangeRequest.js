import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ACCOUNT_REQUEST_STATUS, ACCOUNT_REQUEST_TYPE } from '../utils/constants.js';

class AccountChangeRequest extends Model {}

AccountChangeRequest.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(ACCOUNT_REQUEST_TYPE)), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(ACCOUNT_REQUEST_STATUS)),
      allowNull: false,
      defaultValue: ACCOUNT_REQUEST_STATUS.PENDING,
    },
    firstName: { type: DataTypes.STRING(100) },
    lastName: { type: DataTypes.STRING(100) },
    note: { type: DataTypes.STRING(500) },
    reviewedBy: { type: DataTypes.INTEGER },
    reviewedAt: { type: DataTypes.DATE },
    reviewNote: { type: DataTypes.STRING(500) },
  },
  { sequelize, modelName: 'AccountChangeRequest', tableName: 'account_change_requests' },
);

export default AccountChangeRequest;
