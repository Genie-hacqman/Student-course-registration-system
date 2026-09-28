import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Notification extends Model {}

Notification.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    data: { type: DataTypes.JSON },
    readAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'Notification', tableName: 'notifications' },
);

export default Notification;
