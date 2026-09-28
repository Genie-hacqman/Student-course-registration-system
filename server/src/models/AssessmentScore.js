import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AssessmentScore extends Model {}

AssessmentScore.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    assessmentId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    score: {
      type: DataTypes.DECIMAL(6, 2),
      get() { const v = this.getDataValue('score'); return v === null || v === undefined ? null : Number(v); },
    },
    feedback: { type: DataTypes.STRING(500) },
    gradedBy: { type: DataTypes.INTEGER },
    gradedAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: 'AssessmentScore',
    tableName: 'assessment_scores',
    indexes: [{ unique: true, fields: ['assessment_id', 'student_id'] }],
  },
);

export default AssessmentScore;
