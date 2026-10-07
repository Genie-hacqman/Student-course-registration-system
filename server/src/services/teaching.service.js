import { Op } from 'sequelize';
import {
  CourseSection, Course, Semester, Registration, RegistrationItem, Student, User,
  AttendanceSession, Assessment, AssessmentScore, Result, Schedule,
} from '../models/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { REGISTRATION_ITEM_STATUS, REGISTRATION_STATUS, ROLES } from '../utils/constants.js';
import { hasPermission } from './permission.service.js';
import * as lecturerService from './lecturer.service.js';
import * as semesterService from './semester.service.js';

export const loadSection = async (sectionId, { transaction } = {}) => {
  const section = await CourseSection.findByPk(sectionId, {
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits'] },
      { model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent', 'startDate', 'endDate'] },
    ],
    transaction,
  });
  if (!section) throw new NotFoundError('Section');
  return section;
};

export const briefSection = (section) => ({
  id: section.id,
  sectionCode: section.sectionCode,
  course: section.course,
  semester: section.semester,
});

export const assertCanTeach = async (section, actor, permission) => {
  if (!hasPermission(actor.role, permission)) throw new ForbiddenError();
  if (actor.role === ROLES.LECTURER) {
    const lecturer = await lecturerService.getByUserId(actor.id);
    if (section.lecturerId !== lecturer.id) throw new ForbiddenError('You do not teach this section');
  } else if (actor.role === ROLES.STUDENT) {
    throw new ForbiddenError();
  }
};

const activeRegistration = { status: { [Op.ne]: REGISTRATION_STATUS.CANCELLED } };

export const rosterStudents = async (sectionId, { transaction } = {}) => {
  const items = await RegistrationItem.findAll({
    where: { courseSectionId: sectionId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{
      model: Registration,
      as: 'registration',
      where: activeRegistration,
      attributes: ['id', 'status'],
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'userId', 'studentNumber', 'level'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      }],
    }],
    order: [['createdAt', 'ASC']],
    transaction,
  });
  return items.map((i) => i.registration.student);
};

export const studentSummary = (s) => ({
  studentId: s.id,
  studentNumber: s.studentNumber,
  name: `${s.user.firstName} ${s.user.lastName}`,
});

export const rosterCounts = async (sectionIds) => {
  if (!sectionIds.length) return new Map();
  const rows = await RegistrationItem.findAll({
    attributes: ['courseSectionId', [RegistrationItem.sequelize.fn('COUNT', RegistrationItem.sequelize.col('RegistrationItem.id')), 'count']],
    where: { courseSectionId: sectionIds, status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{ model: Registration, as: 'registration', where: activeRegistration, attributes: [] }],
    group: ['courseSectionId'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.courseSectionId, Number(r.count)]));
};

export const studentSections = async (studentId, semesterId) => {
  const items = await RegistrationItem.findAll({
    where: { status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [
      { model: Registration, as: 'registration', where: { studentId, semesterId, ...activeRegistration }, attributes: [] },
      {
        model: CourseSection,
        as: 'section',
        attributes: ['id', 'sectionCode', 'lecturerId'],
        include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits'] }],
      },
    ],
  });
  return items.map((i) => i.section);
};

export const today = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    day: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()],
  };
};

const PRIORITY = { high: 0, normal: 1 };
const GRADING_WINDOW_DAYS = 14;

export const tasksFor = async (userId, now = new Date()) => {
  const lecturer = await lecturerService.getByUserId(userId);
  const semester = await semesterService.findCurrent();
  if (!semester) return [];
  const sections = await CourseSection.findAll({
    where: { lecturerId: lecturer.id, semesterId: semester.id, status: { [Op.ne]: 'cancelled' } },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title'] },
      { model: Schedule, as: 'schedules' },
    ],
  });
  if (!sections.length) return [];
  const sectionIds = sections.map((s) => s.id);
  const label = (s) => `${s.course.code} (Section ${s.sectionCode})`;
  const { date, day } = today(now);

  const [takenToday, assessments, counts, finalRows] = await Promise.all([
    AttendanceSession.findAll({ where: { courseSectionId: sectionIds, date }, attributes: ['courseSectionId', 'scheduleId'] }),
    Assessment.findAll({
      where: { courseSectionId: sectionIds },
      include: [{ model: AssessmentScore, as: 'scores', attributes: ['score'] }],
    }),
    rosterCounts(sectionIds),
    Result.findAll({ where: { courseSectionId: sectionIds, status: 'final' }, attributes: ['courseSectionId'], group: ['courseSectionId'] }),
  ]);

  const tasks = [];
  const bySection = new Map(sections.map((s) => [s.id, s]));

  for (const section of sections) {
    for (const slot of section.schedules.filter((sc) => sc.day === day)) {
      const taken = takenToday.some((t) => t.courseSectionId === section.id && (t.scheduleId === slot.id || t.scheduleId === null));
      if (!taken && counts.get(section.id)) {
        tasks.push({
          type: 'attendance', priority: 'high', sectionId: section.id, scheduleId: slot.id,
          title: `Take attendance for ${label(section)}`,
          description: `Today ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}${slot.room ? ` · ${slot.room}` : ''}`,
          dueAt: new Date(`${date}T${slot.endTime}`),
        });
      }
    }
  }

  for (const a of assessments) {
    const section = bySection.get(a.courseSectionId);
    if (a.status === 'draft') {
      tasks.push({
        type: 'publish_assessment', priority: 'normal', sectionId: section.id, assessmentId: a.id,
        title: `Publish "${a.title}"`, description: `${label(section)} · still a draft`, dueAt: a.dueAt,
      });
      continue;
    }
    const roster = counts.get(section.id) ?? 0;
    const graded = a.scores.filter((s) => s.score !== null).length;
    if (a.dueAt && a.dueAt < now && graded < roster) {
      tasks.push({
        type: 'grade_assessment', priority: 'high', sectionId: section.id, assessmentId: a.id,
        title: `Grade "${a.title}"`, description: `${label(section)} · ${graded} of ${roster} graded`, dueAt: a.dueAt,
      });
    }
  }

  if (semester.endDate) {
    const end = new Date(`${semester.endDate}T23:59:59`);
    const windowOpens = new Date(end.getTime() - GRADING_WINDOW_DAYS * 86_400_000);
    if (now >= windowOpens) {
      const finalized = new Set(finalRows.map((r) => r.courseSectionId));
      for (const section of sections) {
        if (!finalized.has(section.id) && counts.get(section.id)) {
          tasks.push({
            type: 'submit_grades', priority: now > end ? 'high' : 'normal', sectionId: section.id,
            title: `Submit final grades for ${label(section)}`, description: `Semester ends ${semester.endDate}`, dueAt: end,
          });
        }
      }
    }
  }

  return tasks.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]
    || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
};
