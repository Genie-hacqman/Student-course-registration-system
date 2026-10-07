import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { ASSESSMENT_STATUS, ASSESSMENT_TYPES } from '../utils/constants.js';

class Assessment extends Model {}

Assessment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    courseSectionId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    type: { type: DataTypes.ENUM(...ASSESSMENT_TYPES), allowNull: false },
    description: { type: DataTypes.TEXT },
    maxScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false, get() { return Number(this.getDataValue('maxScore')); } },
    weight: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, get() { return Number(this.getDataValue('weight')); } },
    dueAt: { type: DataTypes.DATE },
    status: {
      type: DataTypes.ENUM(...Object.values(ASSESSMENT_STATUS)),
      allowNull: false,
      defaultValue: ASSESSMENT_STATUS.DRAFT,
    },
    publishedAt: { type: DataTypes.DATE },
    createdBy: { type: DataTypes.INTEGER },
  },
  { sequelize, modelName: 'Assessment', tableName: 'assessments' },
);

export default Assessment;
