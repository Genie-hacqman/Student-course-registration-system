import { Op } from 'sequelize';
import { sequelize, Assessment, AssessmentScore } from '../models/index.js';
import {
  NotFoundError, ConflictError, BadRequestError, ValidationError,
} from '../utils/errors.js';
import { ASSESSMENT_STATUS, PERMISSIONS } from '../utils/constants.js';
import * as teaching from './teaching.service.js';
import * as studentService from './student.service.js';
import * as semesterService from './semester.service.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const loadForTeacher = async (sectionId, actor, options) => {
  const section = await teaching.loadSection(sectionId, options);
  await teaching.assertCanTeach(section, actor, PERMISSIONS.ASSESSMENT_MANAGE);
  return section;
};

const loadAssessment = async (id, actor, { transaction, lock } = {}) => {
  const assessment = await Assessment.findByPk(id, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!assessment) throw new NotFoundError('Assessment');
  const section = await loadForTeacher(assessment.courseSectionId, actor, { transaction });
  return { assessment, section };
};

/** Weights in a section may not add up to more than 100%. */
const checkWeightBudget = async (sectionId, weight, exceptId, transaction) => {
  const others = await Assessment.findAll({ where: { courseSectionId: sectionId }, attributes: ['id', 'weight'], transaction });
  const used = others.filter((a) => a.id !== exceptId).reduce((sum, a) => sum + a.weight, 0);
  if (used + weight > 100) {
    throw new ValidationError(`Assessment weights would total ${used + weight}%; at most ${Math.max(0, 100 - used)}% is left`, [
      { field: 'weight', message: `At most ${Math.max(0, 100 - used)}% is left in this section` },
    ]);
  }
};

const withStats = (assessment, rosterSize) => {
  const scored = assessment.scores.filter((s) => s.score !== null);
  const average = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + s.score, 0) / scored.length / assessment.maxScore) * 1000) / 10
    : null;
  const { scores, ...rest } = assessment.toJSON();
  return { ...rest, graded: scored.length, rosterSize, averagePercent: average };
};

export const listForSection = async (sectionId, actor) => {
  const section = await loadForTeacher(sectionId, actor);
  const [assessments, roster] = await Promise.all([
    Assessment.findAll({
      where: { courseSectionId: section.id },
      include: [{ model: AssessmentScore, as: 'scores', attributes: ['score'] }],
      order: [['dueAt', 'ASC'], ['id', 'ASC']],
    }),
    teaching.rosterStudents(section.id),
  ]);
  const list = assessments.map((a) => withStats(a, roster.length));
  return {
    section: teaching.briefSection(section),
    totalWeight: list.reduce((sum, a) => sum + a.weight, 0),
    assessments: list,
  };
};

export const create = async (sectionId, data, actor, req) => sequelize.transaction(async (transaction) => {
  const section = await loadForTeacher(sectionId, actor, { transaction });
  await checkWeightBudget(section.id, data.weight, null, transaction);
  const assessment = await Assessment.create({
    ...data, courseSectionId: section.id, status: ASSESSMENT_STATUS.DRAFT, createdBy: actor.id,
  }, { transaction });
  await audit.log({
    userId: actor.id, action: 'assessment.create', entityType: 'Assessment', entityId: assessment.id,
    metadata: { courseSectionId: section.id, title: assessment.title }, req, transaction,
  });
  return assessment;
});

export const update = async (id, data, actor, req) => sequelize.transaction(async (transaction) => {
  const { assessment, section } = await loadAssessment(id, actor, { transaction, lock: true });
  if (data.weight !== undefined) await checkWeightBudget(section.id, data.weight, assessment.id, transaction);
  if (data.maxScore !== undefined) {
    const over = await AssessmentScore.count({
      where: { assessmentId: assessment.id, score: { [Op.gt]: data.maxScore } }, transaction,
    });
    if (over) throw new ValidationError(`${over} existing score(s) are above the new maximum`, [{ field: 'maxScore', message: 'Lower than existing scores' }]);
  }
  await assessment.update(data, { transaction });
  await audit.log({
    userId: actor.id, action: 'assessment.update', entityType: 'Assessment', entityId: assessment.id, metadata: data, req, transaction,
  });
  return assessment;
});

export const remove = async (id, actor, req) => sequelize.transaction(async (transaction) => {
  const { assessment } = await loadAssessment(id, actor, { transaction });
  await assessment.destroy({ transaction });
  await audit.log({
    userId: actor.id, action: 'assessment.delete', entityType: 'Assessment', entityId: assessment.id,
    metadata: { title: assessment.title, courseSectionId: assessment.courseSectionId }, req, transaction,
  });
});

export const getScores = async (id, actor) => {
  const { assessment, section } = await loadAssessment(id, actor);
  const [roster, scores] = await Promise.all([
    teaching.rosterStudents(section.id),
    AssessmentScore.findAll({ where: { assessmentId: assessment.id } }),
  ]);
  const byStudent = new Map(scores.map((s) => [s.studentId, s]));
  return {
    assessment,
    section: teaching.briefSection(section),
    students: roster.map((s) => ({
      ...teaching.studentSummary(s),
      score: byStudent.get(s.id)?.score ?? null,
      feedback: byStudent.get(s.id)?.feedback ?? null,
    })),
  };
};

export const setScores = async (id, scores, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const { assessment, section } = await loadAssessment(id, actor, { transaction, lock: true });
    const tooHigh = scores.filter((s) => s.score !== null && s.score > assessment.maxScore);
    if (tooHigh.length) {
      throw new ValidationError(`Scores cannot exceed ${assessment.maxScore}`, tooHigh.map((s) => ({
        studentId: s.studentId, message: `${s.score} is above the maximum of ${assessment.maxScore}`,
      })));
    }
    const ids = new Set((await teaching.rosterStudents(section.id, { transaction })).map((s) => s.id));
    const outsiders = scores.filter((s) => !ids.has(s.studentId)).map((s) => s.studentId);
    if (outsiders.length) throw new BadRequestError('Some students are not registered in this section', { studentIds: outsiders });

    const existing = new Map((await AssessmentScore.findAll({ where: { assessmentId: assessment.id }, transaction })).map((s) => [s.studentId, s]));
    const gradedAt = new Date();
    for (const { studentId, score, feedback } of scores) {
      const fields = { score, feedback: feedback ?? null, gradedBy: actor.id, gradedAt };
      const current = existing.get(studentId);
      if (current) await current.update(fields, { transaction });
      else await AssessmentScore.create({ assessmentId: assessment.id, studentId, ...fields }, { transaction });
    }
    await audit.log({
      userId: actor.id, action: 'assessment.score', entityType: 'Assessment', entityId: assessment.id,
      metadata: { count: scores.length }, req, transaction,
    });
  });
  return getScores(id, actor);
};

/** Makes the assessment (and any scores) visible to students and notifies them. */
export const publish = async (id, actor, req) => sequelize.transaction(async (transaction) => {
  const { assessment, section } = await loadAssessment(id, actor, { transaction, lock: true });
  if (assessment.status === ASSESSMENT_STATUS.PUBLISHED) throw new ConflictError('This assessment is already published');
  await assessment.update({ status: ASSESSMENT_STATUS.PUBLISHED, publishedAt: new Date() }, { transaction });

  const roster = await teaching.rosterStudents(section.id, { transaction });
  await notificationService.createMany({
    userIds: roster.map((s) => s.userId),
    type: 'ASSESSMENT_PUBLISHED',
    title: `${section.course.code}: ${assessment.title}`,
    message: assessment.dueAt
      ? `A new ${assessment.type} was posted for ${section.course.code}, due ${assessment.dueAt.toISOString().slice(0, 10)}.`
      : `A new ${assessment.type} was posted for ${section.course.code}.`,
    data: { assessmentId: assessment.id, courseSectionId: section.id },
  }, { transaction });
  await audit.log({
    userId: actor.id, action: 'assessment.publish', entityType: 'Assessment', entityId: assessment.id,
    metadata: { students: roster.length }, req, transaction,
  });
  return assessment;
});

/** Published assessments in the student's current sections, with their own score where one exists. */
export const forStudent = async (userId) => {
  const student = await studentService.getByUserId(userId);
  const semester = await semesterService.findCurrent();
  if (!semester) return [];
  const sections = await teaching.studentSections(student.id, semester.id);
  if (!sections.length) return [];

  const assessments = await Assessment.findAll({
    where: { courseSectionId: sections.map((s) => s.id), status: ASSESSMENT_STATUS.PUBLISHED },
    include: [{ model: AssessmentScore, as: 'scores', where: { studentId: student.id }, required: false, attributes: ['score', 'feedback', 'gradedAt'] }],
    order: [['dueAt', 'ASC'], ['id', 'ASC']],
  });

  return sections.map((section) => ({
    section: { id: section.id, sectionCode: section.sectionCode, course: section.course },
    assessments: assessments.filter((a) => a.courseSectionId === section.id).map((a) => {
      const { scores, createdBy, ...rest } = a.toJSON();
      return { ...rest, score: scores[0]?.score ?? null, feedback: scores[0]?.feedback ?? null };
    }),
  }));
};
