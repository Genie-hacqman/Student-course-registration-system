import { UniqueConstraintError } from 'sequelize';
import {
  sequelize, Course, Department, Program, ProgramCourse, AcademicYear,
} from '../models/index.js';
import { COURSE_STATUS } from '../utils/constants.js';
import { addGroup } from './prerequisite.service.js';
import * as audit from './audit.service.js';
import { validateCatalog, importOrder, summarize, parseCodes } from './course-import/validate.js';

/*
 * Course-catalogue import (POST /api/admin/import/course-catalog, course:catalog).
 *
 * `dryRun: true` is the preview: every row is validated against the database and reported as valid,
 * invalid or duplicate; nothing is written. A real run validates again (the database may have changed
 * since the preview) and imports the valid courses one transaction per course: the course, its
 * curriculum entries (programme, type, level, semester, academic year) and its prerequisites. A course
 * that fails rolls back alone; courses that depend on it are reported as failed too. Existing courses
 * are never modified, and no sections or timetable slots are created: scheduling stays separate.
 */

const loadLookups = async (rows) => {
  const codes = new Set();
  for (const r of rows) {
    if (r?.courseCode) codes.add(String(r.courseCode).trim().toUpperCase());
    for (const c of parseCodes(r?.prerequisiteCourseCodes)) codes.add(c);
  }
  const [departments, programmes, academicYears, courses] = await Promise.all([
    Department.findAll({ attributes: ['id', 'code', 'name'] }),
    Program.findAll({ attributes: ['id', 'code', 'durationYears'] }),
    AcademicYear.findAll({ attributes: ['id', 'name'] }),
    codes.size ? Course.findAll({ where: { code: [...codes] }, attributes: ['id', 'code', 'level'] }) : [],
  ]);
  const departmentMap = new Map();
  for (const d of departments) {
    departmentMap.set(d.code.toUpperCase(), d);
    departmentMap.set(d.name.toLowerCase(), d);
  }
  return {
    departments: departmentMap,
    programmes: new Map(programmes.map((p) => [p.code.toUpperCase(), p])),
    academicYears: new Map(academicYears.map((y) => [y.name, y])),
    courses: new Map(courses.map((c) => [c.code, { id: c.id, level: c.level }])),
  };
};

const importCourse = async ({ code, rows }, courseIds, actor) => sequelize.transaction(async (transaction) => {
  const first = rows[0];
  const course = await Course.create({
    code,
    title: first.title,
    departmentId: first.department.id,
    credits: first.creditHours,
    level: first.level,
    status: COURSE_STATUS.ACTIVE,
  }, { transaction });

  for (const row of rows) {
    await ProgramCourse.create({
      programId: row.programme.id,
      courseId: course.id,
      type: row.type,
      recommendedLevel: row.level,
      semester: row.semester,
      academicYearId: row.academicYear?.id ?? null,
    }, { transaction });
  }
  // Each listed prerequisite is required (its own group), like adding them one by one.
  for (const pre of first.prerequisites) {
    await addGroup(course.id, { courseIds: [courseIds.get(pre)] }, actor, transaction);
  }
  return course;
});

export const importCatalog = async ({ rows, dryRun }, actor, req) => {
  const lookups = await loadLookups(rows);
  const { results, courses } = validateCatalog(rows, lookups);
  if (dryRun) return summarize(results, { dryRun: true });

  const courseIds = new Map([...lookups.courses].map(([code, c]) => [code, c.id]));
  const failedCodes = new Set();
  const mark = (group, status, message) => {
    for (const r of group.rows) {
      results[r.index].status = status;
      if (message) results[r.index].errors.push(message);
    }
  };

  for (const group of importOrder(courses)) {
    const missing = group.rows[0].prerequisites.find((pre) => failedCodes.has(pre) || !courseIds.has(pre));
    if (missing) {
      failedCodes.add(group.code);
      mark(group, 'failed', `Not imported: prerequisite ${missing} was not imported`);
      continue;
    }
    try {
      const course = await importCourse(group, courseIds, actor);
      courseIds.set(group.code, course.id);
      mark(group, 'imported');
    } catch (err) {
      failedCodes.add(group.code);
      // Someone created the same code since validation: still never overwrite it.
      if (err instanceof UniqueConstraintError) mark(group, 'duplicate', `Course ${group.code} already exists — it was not changed`);
      else mark(group, 'failed', `Not imported: ${err.message}`);
    }
  }

  const report = summarize(results, { dryRun: false });
  await audit.log({
    userId: actor.id,
    action: 'import.course_catalog',
    entityType: 'Course',
    metadata: {
      total: report.total, imported: report.imported, failed: report.failed, invalid: report.invalid, duplicates: report.duplicates,
    },
    req,
  });
  return report;
};
