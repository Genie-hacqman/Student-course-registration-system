import { Op } from 'sequelize';
import {
  sequelize, Registration, RegistrationItem, CourseSection, Course, Schedule, Semester, Student, User, Program, ProgramCourse, Lecturer,
  AcademicYear,
} from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import {
  AppError, NotFoundError, ConflictError, RegistrationRuleError, BadRequestError,
} from '../utils/errors.js';
import {
  REGISTRATION_STATUS, REGISTRATION_ITEM_STATUS, COURSE_STATUS, SECTION_STATUS, STAFF_OVERRIDABLE_RULES,
} from '../utils/constants.js';
import {
  emitCapacityUpdated, emitRegistrationCreated, emitRegistrationStatusChanged, emitTimetableUpdated,
} from '../sockets/registration.socket.js';
import {
  ADD_RULES, SUBMIT_ITEM_RULES, runRules, registrationWindow, studentEligibility, corequisiteWarnings,
} from './registration/rules/index.js';
import * as prerequisiteService from './prerequisite.service.js';
import * as studentService from './student.service.js';
import * as semesterService from './semester.service.js';
import * as waitlistService from './waitlist.service.js';
import * as notificationService from './notification.service.js';
import * as settingService from './setting.service.js';
import * as priorityService from './priority.service.js';
import * as audit from './audit.service.js';
import * as timetableService from './timetable.service.js';

const { REGISTERED, DROPPED } = REGISTRATION_ITEM_STATUS;

const sectionDetail = {
  model: CourseSection,
  as: 'section',
  attributes: ['id', 'courseId', 'semesterId', 'sectionCode', 'capacity', 'seatsTaken', 'status', 'lecturerId'],
  include: [
    { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits', 'level', 'status'] },
    { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
    {
      model: Lecturer,
      as: 'lecturer',
      attributes: ['id', 'title'],
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
    },
  ],
};

const activeItemsInclude = {
  model: RegistrationItem,
  as: 'items',
  required: false,
  where: { status: REGISTERED },
  include: [sectionDetail],
};

// ── helpers ───────────────────────────────────────────────────────────────────

const requireCurrentSemester = async (transaction) => {
  const semester = await semesterService.findCurrent({ transaction });
  if (!semester) throw new NotFoundError('Current semester');
  return semester;
};

/** Semester limit, then program limit, then the system default. */
const resolveMaxCredits = async (semester, student, transaction) => {
  if (semester.maxCredits) return semester.maxCredits;
  const program = await Program.findByPk(student.programId, { attributes: ['maxCredits'], transaction });
  if (program?.maxCredits) return program.maxCredits;
  return settingService.get('registration.defaultMaxCredits', { transaction });
};

/** When this student may start registering (priority window / individual override), for the window rule. */
const priorityContext = async (student, semester, transaction) => {
  const priority = await priorityService.resolveOpensAt(student, semester, { transaction });
  return { opensAt: priority.opensAt, priority };
};

/**
 * The course's entry on the student's curriculum, shaped for the semesterEligibility rule, or null when
 * it isn't on the programme. `notYetInEffect`: the entry's academic year starts after this semester's.
 */
const toCurriculum = (entry, entryYear, semesterYear) => ({
  semester: entry.semester ?? null,
  effectiveYear: entryYear?.name ?? null,
  notYetInEffect: Boolean(entryYear && semesterYear && entryYear.startDate > semesterYear.startDate),
});

const curriculumFor = async (student, courseId, semester, transaction) => {
  const entry = await ProgramCourse.findOne({
    where: { programId: student.programId, courseId },
    attributes: ['id', 'semester', 'academicYearId'],
    transaction,
  });
  if (!entry) return null;
  const [entryYear, semesterYear] = entry.academicYearId
    ? await Promise.all([
      AcademicYear.findByPk(entry.academicYearId, { attributes: ['name', 'startDate'], transaction }),
      AcademicYear.findByPk(semester.academicYearId, { attributes: ['name', 'startDate'], transaction }),
    ])
    : [null, null];
  return toCurriculum(entry, entryYear, semesterYear);
};

/** A full section offers a waitlist only if waitlists are enabled globally AND for that section. */
const isWaitlistOffered = async (section, transaction) =>
  Boolean(section.waitlistEnabled) && Boolean(await settingService.get('registration.waitlistEnabled', { transaction }));

/**
 * Gets the student's registration for the semester, creating a draft if needed, and locks it.
 * Every mutation locks the registration first and the section second, in that order,
 * so concurrent requests from the same student are serialised and can't deadlock each other.
 */
const lockRegistration = async (studentId, semesterId, transaction) => {
  const [, created] = await Registration.findOrCreate({
    where: { studentId, semesterId },
    defaults: { studentId, semesterId, status: REGISTRATION_STATUS.DRAFT },
    transaction,
  });
  const registration = await Registration.findOne({
    where: { studentId, semesterId },
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  return { registration, created };
};

const loadActiveItems = (registrationId, transaction) =>
  RegistrationItem.findAll({ where: { registrationId, status: REGISTERED }, include: [sectionDetail], transaction });

/** Section row locked FOR UPDATE, with course and schedules loaded separately (locks and outer joins don't mix). */
const lockSection = async (sectionId, transaction) => {
  const section = await CourseSection.findByPk(sectionId, { lock: transaction.LOCK.UPDATE, transaction });
  if (!section) throw new NotFoundError('Section');
  section.course = await Course.findByPk(section.courseId, { transaction });
  section.schedules = await Schedule.findAll({ where: { courseSectionId: section.id }, transaction });
  return section;
};

/** Changing a registration after review sends it back through the approval flow. */
const statusAfterChange = (status) => {
  if (status === REGISTRATION_STATUS.APPROVED) return REGISTRATION_STATUS.SUBMITTED;
  if (status === REGISTRATION_STATUS.REJECTED || status === REGISTRATION_STATUS.CANCELLED) return REGISTRATION_STATUS.DRAFT;
  return status;
};

const recalcCredits = async (registration, transaction) => {
  const total = await RegistrationItem.sum('credits', { where: { registrationId: registration.id, status: REGISTERED }, transaction });
  registration.totalCredits = total ?? 0;
};

/** Printed on the registration slip, e.g. REG-2026-02-000014. Assigned on first submit and never changed. */
const buildReferenceNumber = (registration, now) =>
  `REG-${now.getUTCFullYear()}-${String(registration.semesterId).padStart(2, '0')}-${String(registration.id).padStart(6, '0')}`;

export const getRegistrationDetail = (id) =>
  Registration.findByPk(id, {
    include: [
      { model: Semester, as: 'semester', attributes: ['id', 'name', 'registrationStart', 'registrationEnd', 'addDropEnd', 'maxCredits', 'minCredits'] },
      activeItemsInclude,
    ],
  });

// ── student-facing ────────────────────────────────────────────────────────────

export const getCurrent = async (userId) => {
  const student = await studentService.getByUserId(userId);
  const semester = await requireCurrentSemester();
  const registration = await Registration.findOne({ where: { studentId: student.id, semesterId: semester.id } });
  const maxCredits = await resolveMaxCredits(semester, student);
  const priority = await priorityService.resolveOpensAt(student, semester);
  const now = new Date();

  return {
    semester: {
      id: semester.id,
      name: semester.name,
      registrationStart: semester.registrationStart,
      registrationEnd: semester.registrationEnd,
      addDropEnd: semester.addDropEnd,
      myRegistrationOpensAt: priority.opensAt,
      priority: { source: priority.source, windowName: priority.windowName },
      registrationOpen: now >= priority.opensAt && now <= semester.registrationEnd,
      addDropOpen: semester.isAddDropOpen(now),
      minCredits: semester.minCredits,
      maxCredits,
    },
    registration: registration ? await getRegistrationDetail(registration.id) : null,
  };
};

/**
 * Sections the student can register for this semester: only courses on their program's curriculum.
 * Each section is annotated by running the same ADD_RULES that addItem enforces (without locks),
 * so what the student sees always matches what registration will accept or reject, and why.
 */
export const getAvailableCourses = async (userId, query = {}) => {
  const student = await studentService.getByUserId(userId);
  const semester = await requireCurrentSemester();
  const now = new Date();

  const courseWhere = { status: COURSE_STATUS.ACTIVE };
  if (query.level) courseWhere.level = query.level;
  if (query.departmentId) courseWhere.departmentId = query.departmentId;
  if (query.search) {
    const like = `%${query.search}%`;
    courseWhere[Op.or] = [{ code: { [Op.like]: like } }, { title: { [Op.like]: like } }];
  }

  const sections = await CourseSection.findAll({
    where: { semesterId: semester.id, status: { [Op.ne]: SECTION_STATUS.CANCELLED } },
    include: [
      {
        model: Course,
        as: 'course',
        where: courseWhere,
        attributes: ['id', 'code', 'title', 'description', 'credits', 'level', 'status', 'departmentId'],
        include: [{
          model: Program,
          as: 'programs',
          where: { id: student.programId },
          attributes: ['id'],
          through: { attributes: ['type', 'semester', 'academicYearId'] },
        }],
      },
      { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
      sectionDetail.include.find((i) => i.as === 'lecturer'),
    ],
    order: [[{ model: Course, as: 'course' }, 'code', 'ASC'], ['sectionCode', 'ASC']],
  });

  const registration = await Registration.findOne({ where: { studentId: student.id, semesterId: semester.id } });
  const otherItems = registration ? await loadActiveItems(registration.id) : [];
  const maxCredits = await resolveMaxCredits(semester, student);
  const requirements = await prerequisiteService.evaluateRequirements(student.id, [...new Set(sections.map((s) => s.courseId))], {
    semesterId: semester.id,
    heldCourseIds: otherItems.map((i) => i.courseId),
  });
  const priority = await priorityService.resolveOpensAt(student, semester);
  const waitlistsOn = Boolean(await settingService.get('registration.waitlistEnabled'));
  const years = new Map((await AcademicYear.findAll({ attributes: ['id', 'name', 'startDate'] })).map((y) => [y.id, y]));

  const courses = new Map();
  for (const section of sections) {
    const waitlistOffered = waitlistsOn && section.waitlistEnabled;
    const registered = otherItems.some((i) => i.courseSectionId === section.id);
    const failures = registered ? [] : runRules(ADD_RULES, {
      now,
      semester,
      student,
      registration,
      section,
      otherItems,
      maxCredits,
      inProgram: true,
      curriculum: toCurriculum(
        section.course.programs[0].ProgramCourse,
        years.get(section.course.programs[0].ProgramCourse.academicYearId),
        years.get(semester.academicYearId),
      ),
      programName: student.program?.name,
      waitlistOffered,
      requirements: requirements.get(section.courseId),
      opensAt: priority.opensAt,
      priority,
    });

    let status = 'eligible';
    if (registered) status = 'registered';
    else if (failures.length === 1 && failures[0].rule === 'CAPACITY') status = 'full';
    else if (failures.length) status = 'blocked';
    if (query.eligibleOnly && status !== 'eligible') continue;

    const { course } = section;
    if (!courses.has(course.id)) {
      courses.set(course.id, {
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        credits: course.credits,
        level: course.level,
        departmentId: course.departmentId,
        type: course.programs[0]?.ProgramCourse?.type ?? 'core',
        sections: [],
      });
    }
    courses.get(course.id).sections.push({
      id: section.id,
      sectionCode: section.sectionCode,
      capacity: section.capacity,
      seatsTaken: section.seatsTaken,
      seatsAvailable: section.seatsAvailable,
      waitlistOffered,
      status,
      reasons: failures.map(({ rule, message, details }) => ({ rule, message, ...(details ? { details } : {}) })),
      // Non-blocking: corequisites are enforced on submit, not on add.
      notes: registered ? [] : corequisiteWarnings(section, requirements.get(section.courseId))
        .map((message) => ({ rule: 'COREQUISITE', message })),
      schedules: section.schedules,
      lecturer: section.lecturer,
    });
  }

  return {
    semester: {
      id: semester.id,
      name: semester.name,
      myRegistrationOpensAt: priority.opensAt,
      priority: { source: priority.source, windowName: priority.windowName },
      registrationOpen: now >= priority.opensAt && now <= semester.registrationEnd,
      addDropOpen: semester.isAddDropOpen(now),
    },
    program: student.program ? { id: student.program.id, name: student.program.name, code: student.program.code } : null,
    currentCredits: otherItems.reduce((sum, i) => sum + i.credits, 0),
    maxCredits,
    courses: [...courses.values()],
  };
};

/**
 * Adds a section to the student's current-semester registration. `actor` is set when staff act for the student:
 * the registration-window rule is skipped, checks in STAFF_OVERRIDABLE_RULES may be overridden with a reason
 * (recorded on the item so submit honours them), and an approved registration is not sent back for approval.
 */
const addSection = async (student, courseSectionId, { actor, override = false, reason, req } = {}) => {
  const byStaff = Boolean(actor);

  const { registrationId, section, created, confirmation } = await sequelize.transaction(async (transaction) => {
    const semester = await requireCurrentSemester(transaction);
    const { registration, created: isNew } = await lockRegistration(student.id, semester.id, transaction);
    const lockedSection = await lockSection(courseSectionId, transaction);

    const otherItems = await loadActiveItems(registration.id, transaction);
    const context = {
      now: new Date(),
      semester,
      student,
      registration,
      section: lockedSection,
      otherItems,
      maxCredits: await resolveMaxCredits(semester, student, transaction),
      requirements: await prerequisiteService.evaluateRequirement(student.id, lockedSection.courseId, {
        semesterId: semester.id,
        heldCourseIds: [...otherItems.map((i) => i.courseId), lockedSection.courseId],
        transaction,
      }),
      ...(await priorityContext(student, semester, transaction)),
      programName: student.program?.name,
      waitlistOffered: await isWaitlistOffered(lockedSection, transaction),
    };
    context.curriculum = await curriculumFor(student, lockedSection.courseId, semester, transaction);
    context.inProgram = Boolean(context.curriculum);

    const failures = runRules(byStaff ? ADD_RULES.filter((rule) => rule !== registrationWindow) : ADD_RULES, context);
    let overridden = [];
    if (failures.length) {
      const blocking = byStaff && override ? failures.filter((f) => !STAFF_OVERRIDABLE_RULES.includes(f.rule)) : failures;
      if (blocking.length) {
        // Staff see which failures they could override, so the UI can offer it.
        throw new RegistrationRuleError(byStaff
          ? failures.map((f) => ({ ...f, overridable: STAFF_OVERRIDABLE_RULES.includes(f.rule) }))
          : failures);
      }
      overridden = failures.map((f) => f.rule);
    }

    // Row is locked, but keep the guard in SQL too so overselling is impossible even if the lock is removed later.
    const [affected] = await CourseSection.update(
      { seatsTaken: sequelize.literal('seats_taken + 1') },
      { where: { id: lockedSection.id, seatsTaken: { [Op.lt]: sequelize.col('capacity') } }, transaction },
    );
    if (!affected) throw new RegistrationRuleError([{ rule: 'CAPACITY', passed: false, message: 'Section is full' }]);
    lockedSection.seatsTaken += 1;

    const previous = await RegistrationItem.findOne({
      where: { registrationId: registration.id, courseSectionId: lockedSection.id },
      transaction,
    });
    const itemFields = {
      courseId: lockedSection.courseId,
      credits: lockedSection.course.credits,
      status: REGISTERED,
      droppedAt: null,
      addedBy: byStaff ? actor.id : null,
      overriddenRules: overridden.length ? overridden : null,
      overrideReason: overridden.length ? reason : null,
    };
    const item = previous
      ? await previous.update(itemFields, { transaction })
      : await RegistrationItem.create({ registrationId: registration.id, courseSectionId: lockedSection.id, ...itemFields }, { transaction });

    await recalcCredits(registration, transaction);
    if (!byStaff) {
      registration.status = statusAfterChange(registration.status);
      // A changed course list must be re-confirmed when it is approved again.
      if (registration.status !== REGISTRATION_STATUS.APPROVED) registration.timetableConfirmedAt = null;
    }
    await registration.save({ transaction });

    await waitlistService.markConverted(student.id, lockedSection.id, { transaction });

    const { course } = lockedSection;
    const confirmation = {
      message: byStaff
        ? `The registry added you to ${course.code} — ${course.title} (section ${lockedSection.sectionCode}).`
        : `You are registered for ${course.code} — ${course.title} (section ${lockedSection.sectionCode}).`,
      course: { id: course.id, code: course.code, title: course.title, credits: course.credits },
      itemId: item.id,
      courseSectionId: lockedSection.id,
      sectionCode: lockedSection.sectionCode,
      seatsRemaining: Math.max(lockedSection.capacity - lockedSection.seatsTaken, 0),
      totalCredits: registration.totalCredits,
      maxCredits: context.maxCredits,
      warnings: corequisiteWarnings(lockedSection, context.requirements),
      overridden,
    };
    await notificationService.create({
      userId: student.userId,
      type: byStaff ? 'COURSE_ADDED_BY_STAFF' : 'COURSE_REGISTERED',
      title: byStaff ? `Added to ${course.code} by the registry` : `Registered for ${course.code}`,
      message: confirmation.message,
      data: { registrationId: registration.id, courseSectionId: lockedSection.id },
    }, { transaction });
    await audit.log({
      userId: actor?.id ?? student.userId,
      action: byStaff ? 'registration.staff_add' : 'registration.add',
      entityType: 'Registration',
      entityId: registration.id,
      metadata: {
        courseSectionId: lockedSection.id, courseCode: course.code, studentId: student.id,
        ...(overridden.length ? { overridden, reason } : {}),
      },
      req,
      transaction,
    });

    return { registrationId: registration.id, section: lockedSection, created: isNew, confirmation };
  });

  emitCapacityUpdated(section);
  emitTimetableUpdated(student.userId, { registrationId });
  if (created) emitRegistrationCreated(student.userId, { registrationId, studentId: student.id });

  return { confirmation, registration: await getRegistrationDetail(registrationId) };
};

export const addItem = async (userId, courseSectionId, req) =>
  addSection(await studentService.getByUserId(userId), courseSectionId, { req });

/**
 * Drops one registered item. With `actor` (staff) the window rule is skipped and the registration keeps
 * its status; the student is told, since they didn't do it themselves.
 */
const removeItem = async (student, itemWhere, { actor, reason, req } = {}) => {
  const byStaff = Boolean(actor);

  const { registrationId, section } = await sequelize.transaction(async (transaction) => {
    const semester = await requireCurrentSemester(transaction);
    const registration = await Registration.findOne({
      where: { studentId: student.id, semesterId: semester.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!registration) throw new NotFoundError('Registration item');

    const item = await RegistrationItem.findOne({
      where: { ...itemWhere, registrationId: registration.id, status: REGISTERED },
      transaction,
    });
    if (!item) throw new NotFoundError('Registration item');

    if (!byStaff) {
      const failures = runRules([registrationWindow, studentEligibility], {
        now: new Date(), semester, registration, student, ...(await priorityContext(student, semester, transaction)),
      });
      if (failures.length) throw new RegistrationRuleError(failures);
    }

    const lockedSection = await lockSection(item.courseSectionId, transaction);
    await CourseSection.update(
      { seatsTaken: sequelize.literal('GREATEST(seats_taken - 1, 0)') },
      { where: { id: lockedSection.id }, transaction },
    );
    lockedSection.seatsTaken = Math.max(lockedSection.seatsTaken - 1, 0);

    await item.update({ status: DROPPED, droppedAt: new Date() }, { transaction });
    await recalcCredits(registration, transaction);
    if (!byStaff) {
      registration.status = statusAfterChange(registration.status);
      // A changed course list must be re-confirmed when it is approved again.
      if (registration.status !== REGISTRATION_STATUS.APPROVED) registration.timetableConfirmedAt = null;
    }
    await registration.save({ transaction });

    await waitlistService.notifyNext(lockedSection, { transaction, count: 1 });
    const { course } = lockedSection;
    if (byStaff) {
      await notificationService.create({
        userId: student.userId,
        type: 'COURSE_DROPPED_BY_STAFF',
        title: `Removed from ${course.code} by the registry`,
        message: `The registry removed you from ${course.code} — ${course.title} (section ${lockedSection.sectionCode}).${reason ? ` Reason: ${reason}` : ''}`,
        data: { registrationId: registration.id, courseSectionId: lockedSection.id },
      }, { transaction });
    }
    await audit.log({
      userId: actor?.id ?? student.userId,
      action: byStaff ? 'registration.staff_drop' : 'registration.drop',
      entityType: 'Registration',
      entityId: registration.id,
      metadata: { itemId: item.id, courseSectionId: lockedSection.id, courseCode: course.code, studentId: student.id, ...(reason ? { reason } : {}) },
      req,
      transaction,
    });

    return { registrationId: registration.id, section: lockedSection };
  });

  emitCapacityUpdated(section);
  emitTimetableUpdated(student.userId, { registrationId });

  return getRegistrationDetail(registrationId);
};

export const dropItem = async (userId, itemId, req) =>
  removeItem(await studentService.getByUserId(userId), { id: itemId }, { req });

// ── staff enrolment (registration:manage) ─────────────────────────────────────

export const staffAddStudent = async (sectionId, { studentId, override, reason }, actor, req) =>
  addSection(await studentService.getById(studentId), sectionId, { actor, override, reason, req });

export const staffRemoveStudent = async (sectionId, studentId, { reason }, actor, req) =>
  removeItem(await studentService.getById(studentId), { courseSectionId: sectionId }, { actor, reason, req });

/** Re-runs every rule against the whole selection, then submits (or auto-approves if approval is disabled). */
export const submit = async (userId, req) => {
  const student = await studentService.getByUserId(userId);

  const registration = await sequelize.transaction(async (transaction) => {
    const semester = await requireCurrentSemester(transaction);
    const reg = await Registration.findOne({
      where: { studentId: student.id, semesterId: semester.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!reg) throw new BadRequestError('Add at least one course before submitting');
    if ([REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.APPROVED].includes(reg.status)) {
      throw new ConflictError(`Registration is already ${reg.status}`);
    }

    const items = await loadActiveItems(reg.id, transaction);
    if (!items.length) throw new BadRequestError('Add at least one course before submitting');

    const now = new Date();
    const failures = runRules([registrationWindow, studentEligibility], {
      now, semester, registration: reg, student, ...(await priorityContext(student, semester, transaction)),
    });

    const totalCredits = items.reduce((sum, i) => sum + i.credits, 0);
    const maxCredits = await resolveMaxCredits(semester, student, transaction);
    const overrode = (item, rule) => Array.isArray(item.overriddenRules) && item.overriddenRules.includes(rule);
    if (totalCredits > maxCredits && !items.some((i) => overrode(i, 'CREDIT_LIMIT'))) {
      failures.push({ rule: 'CREDIT_LIMIT', passed: false, message: `You have ${totalCredits} credits; the maximum is ${maxCredits}` });
    }
    if (totalCredits < semester.minCredits) {
      failures.push({ rule: 'MINIMUM_CREDITS', passed: false, message: `You have ${totalCredits} credits; the minimum is ${semester.minCredits}` });
    }

    const requirements = await prerequisiteService.evaluateRequirements(student.id, items.map((i) => i.courseId), {
      semesterId: semester.id,
      heldCourseIds: items.map((i) => i.courseId),
      transaction,
    });
    for (const [index, item] of items.entries()) {
      const context = {
        now,
        semester,
        student,
        section: item.section,
        // Only compare with later items so each clashing pair is reported once.
        otherItems: items.slice(index + 1),
        requirements: requirements.get(item.courseId),
        programName: student.program?.name,
      };
      context.curriculum = await curriculumFor(student, item.courseId, semester, transaction);
      context.inProgram = Boolean(context.curriculum);
      for (const failure of runRules(SUBMIT_ITEM_RULES, context)) {
        // A check staff overrode when adding this course (on either side of a clash) doesn't block submit.
        const clashOverridden = failure.rule === 'TIMETABLE_CONFLICT' && (failure.details?.conflictingCourses ?? [])
          .some((c) => items.some((i) => i.courseSectionId === c.courseSectionId && overrode(i, 'TIMETABLE_CONFLICT')));
        if (overrode(item, failure.rule) || clashOverridden) continue;
        failures.push({ ...failure, courseSectionId: item.courseSectionId });
      }
    }
    if (failures.length) throw new RegistrationRuleError(failures);

    const requireApproval = await settingService.get('registration.requireApproval', { transaction });
    await reg.update({
      status: requireApproval ? REGISTRATION_STATUS.SUBMITTED : REGISTRATION_STATUS.APPROVED,
      submittedAt: now,
      referenceNumber: reg.referenceNumber ?? buildReferenceNumber(reg, now),
      totalCredits,
      remarks: null,
    }, { transaction });

    await notificationService.create({
      userId,
      type: 'REGISTRATION_SUBMITTED',
      title: 'Registration submitted',
      message: requireApproval
        ? `Your ${semester.name} registration (${totalCredits} credits) was submitted and is awaiting approval.`
        : `Your ${semester.name} registration (${totalCredits} credits) is confirmed.`,
      data: { registrationId: reg.id },
    }, { transaction });
    await audit.log({ userId, action: 'registration.submit', entityType: 'Registration', entityId: reg.id, metadata: { totalCredits }, req, transaction });
    return reg;
  });

  emitRegistrationStatusChanged(userId, { registrationId: registration.id, status: registration.status });
  return getRegistrationDetail(registration.id);
};

export const history = async (userId) => {
  const student = await studentService.getByUserId(userId);
  return Registration.findAll({
    where: { studentId: student.id },
    include: [
      { model: Semester, as: 'semester', attributes: ['id', 'name', 'startDate', 'endDate'] },
      activeItemsInclude,
    ],
    order: [['createdAt', 'DESC']],
  });
};

// ── staff-facing ──────────────────────────────────────────────────────────────

export const listAll = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['createdAt', 'submittedAt', 'totalCredits'], ['submittedAt', 'DESC']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.semesterId) where.semesterId = query.semesterId;
  if (query.studentId) where.studentId = query.studentId;

  const result = await Registration.findAndCountAll({
    where,
    include: [
      { model: Semester, as: 'semester', attributes: ['id', 'name'] },
      {
        model: Student,
        as: 'student',
        attributes: ['id', 'studentNumber', 'level'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      },
    ],
    limit,
    offset,
    order,
    distinct: true,
  });
  return { result, page, limit };
};

export const getById = async (id) => {
  const registration = await Registration.findByPk(id, {
    include: [
      { model: Semester, as: 'semester', attributes: ['id', 'name'] },
      {
        model: Student,
        as: 'student',
        attributes: ['id', 'studentNumber', 'level', 'programId'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      },
      activeItemsInclude,
    ],
  });
  if (!registration) throw new NotFoundError('Registration');
  return registration;
};

/**
 * Approving also confirms the student's timetable: `findAllocationIssues` re-checks their sections for
 * student, lecturer and room clashes (and missing class times/rooms) under the registration row lock.
 * Any issue refuses the approval — nothing is written to the registration — and the issues are recorded
 * for staff (GET /admin/timetable-issues), then returned as a 409 TIMETABLE_CONFLICT.
 */
const review = async (id, decision, remarks, actor, req) => {
  const approved = decision === REGISTRATION_STATUS.APPROVED;
  const outcome = await sequelize.transaction(async (transaction) => {
    const reg = await Registration.findByPk(id, {
      include: [{ model: Student, as: 'student', attributes: ['id', 'userId'] }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!reg) throw new NotFoundError('Registration');
    if (reg.status !== REGISTRATION_STATUS.SUBMITTED) {
      throw new ConflictError(`Only submitted registrations can be reviewed (current status: ${reg.status})`);
    }

    if (approved) {
      const issues = await timetableService.findAllocationIssues(reg.id, transaction);
      if (issues.length) return { issues };
    }

    await reg.update({
      status: decision, reviewedAt: new Date(), reviewedBy: actor.id, remarks: remarks ?? null,
      ...(approved ? { timetableConfirmedAt: new Date() } : {}),
    }, { transaction });
    if (approved) await timetableService.closeIssues(reg.id, actor, transaction);

    await notificationService.create({
      userId: reg.student.userId,
      type: approved ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
      title: approved ? 'Registration approved' : 'Registration needs changes',
      message: approved
        ? 'Your course registration has been approved and your timetable is confirmed.'
        : `Your course registration was not approved.${remarks ? ` Reason: ${remarks}` : ''} Please update it and resubmit.`,
      data: { registrationId: reg.id },
    }, { transaction });
    await audit.log({ userId: actor.id, action: `registration.${decision}`, entityType: 'Registration', entityId: reg.id, metadata: { remarks }, req, transaction });

    return { registration: reg, studentUserId: reg.student.userId };
  });

  if (outcome.issues) {
    await timetableService.recordIssues(id, outcome.issues, actor);
    throw new AppError(
      'The timetable could not be confirmed, so the registration was not approved. Resolve the listed clashes and approve again.',
      409, 'TIMETABLE_CONFLICT', outcome.issues,
    );
  }

  const { registration, studentUserId } = outcome;
  emitRegistrationStatusChanged(studentUserId, { registrationId: registration.id, status: registration.status });
  if (approved) emitTimetableUpdated(studentUserId, { registrationId: registration.id });
  return getById(registration.id);
};

export const approve = (id, remarks, actor, req) => review(id, REGISTRATION_STATUS.APPROVED, remarks, actor, req);
export const reject = (id, remarks, actor, req) => review(id, REGISTRATION_STATUS.REJECTED, remarks, actor, req);
