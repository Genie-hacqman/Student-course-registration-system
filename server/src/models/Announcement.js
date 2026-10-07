import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ANNOUNCEMENT_AUDIENCE } from '../utils/constants.js';

class Announcement extends Model {}

Announcement.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    authorId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    audience: { type: DataTypes.ENUM(...Object.values(ANNOUNCEMENT_AUDIENCE)), allowNull: false },
    courseSectionId: { type: DataTypes.INTEGER },
    programId: { type: DataTypes.INTEGER },
    pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    emailedAt: { type: DataTypes.DATE },
    recipientCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: 'Announcement', tableName: 'announcements' },
);

export default Announcement;
