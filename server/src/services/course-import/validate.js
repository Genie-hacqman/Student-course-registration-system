/*
 * Course-catalogue import: validation, with no database access. The service loads the lookups
 * (departments, programmes, academic years, existing courses) once and calls `validateCatalog`, so
 * every rule here is unit-tested without MySQL (tests/unit/course-import.test.js).
 *
 * One row = one course on one programme's curriculum. The same course code may appear on several
 * rows (a course shared by programmes); its course-level fields must then agree.
 */

export const COURSE_TYPES = ['core', 'elective'];
export const MAX_CREDIT_HOURS = 12;
const CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;
const SESSION_PATTERN = /^\d{4}\/\d{4}$/;
const SEMESTER_WORDS = { first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 };

const text = (v) => (v == null ? '' : String(v).trim());

/** "1", 2, "Semester 2", "Second", "2nd" → 1-3, or null. */
export const parseSemester = (value) => {
  const v = text(value).toLowerCase();
  if (!v) return null;
  const word = v.replace(/\s*semester\s*/g, ' ').trim();
  if (SEMESTER_WORDS[word]) return SEMESTER_WORDS[word];
  const n = Number(word);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
};

/** "CS101; CS102,MATH101" or an array → unique upper-cased codes. */
export const parseCodes = (value) => {
  const list = Array.isArray(value) ? value : text(value).split(/[;,|]/);
  return [...new Set(list.map((c) => text(c).toUpperCase()).filter(Boolean))];
};

const toInt = (v) => {
  const s = text(v);
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
};

/** Normalises one raw row and collects the checks that need no other rows. */
const checkRow = (raw, index, lookups) => {
  const errors = [];
  const row = {
    index,
    line: Number.isInteger(raw.line) ? raw.line : index + 2, // spreadsheet line; +2 for the header row
    code: text(raw.courseCode).toUpperCase(),
    title: text(raw.courseTitle),
    departmentKey: text(raw.department),
    programmeCode: text(raw.programme).toUpperCase(),
    level: toInt(raw.level),
    semester: parseSemester(raw.semester),
    creditHours: toInt(raw.creditHours),
    type: text(raw.courseType).toLowerCase(),
    prerequisites: parseCodes(raw.prerequisiteCourseCodes),
    academicYearName: text(raw.academicYear),
  };

  if (!row.code) errors.push('course_code is required');
  else if (!CODE_PATTERN.test(row.code)) errors.push(`course_code "${row.code}" may only use letters, numbers and dashes (2-20 characters)`);
  if (!row.title) errors.push('course_title is required');
  else if (row.title.length < 2 || row.title.length > 200) errors.push('course_title must be 2-200 characters');

  if (!row.departmentKey) errors.push('department is required');
  else {
    row.department = lookups.departments.get(row.departmentKey.toUpperCase()) ?? lookups.departments.get(row.departmentKey.toLowerCase());
    if (!row.department) errors.push(`department "${row.departmentKey}" does not exist (use its code or exact name)`);
  }

  if (!row.programmeCode) errors.push('programme is required');
  else {
    row.programme = lookups.programmes.get(row.programmeCode);
    if (!row.programme) errors.push(`programme "${row.programmeCode}" does not exist (use its code)`);
  }

  if (Number.isNaN(row.level) && text(raw.level) === '') errors.push('level is required');
  else if (Number.isNaN(row.level) || row.level % 100 !== 0 || row.level < 100) {
    errors.push(`level "${text(raw.level)}" must be 100, 200, 300…`);
  } else if (row.programme && row.level > row.programme.durationYears * 100) {
    errors.push(`level ${row.level} is beyond ${row.programme.code}, which runs to level ${row.programme.durationYears * 100}`);
  }

  if (!text(raw.semester)) errors.push('semester is required');
  else if (!row.semester) errors.push(`semester "${text(raw.semester)}" must be 1, 2 or 3`);

  if (text(raw.creditHours) === '') errors.push('credit_hours is required');
  else if (Number.isNaN(row.creditHours) || row.creditHours < 1 || row.creditHours > MAX_CREDIT_HOURS) {
    errors.push(`credit_hours "${text(raw.creditHours)}" must be a whole number from 1 to ${MAX_CREDIT_HOURS}`);
  }

  if (!row.type) errors.push('course_type is required');
  else if (!COURSE_TYPES.includes(row.type)) errors.push(`course_type "${text(raw.courseType)}" must be core or elective`);

  if (row.academicYearName) {
    if (!SESSION_PATTERN.test(row.academicYearName)) errors.push(`academic_year "${row.academicYearName}" must look like 2026/2027`);
    else {
      row.academicYear = lookups.academicYears.get(row.academicYearName);
      if (!row.academicYear) errors.push(`academic_year "${row.academicYearName}" has not been set up`);
    }
  }

  if (row.code && row.prerequisites.includes(row.code)) errors.push(`${row.code} cannot be its own prerequisite`);
  return { row, errors };
};

const sameCourse = (a, b) => {
  const diffs = [];
  if (a.title !== b.title) diffs.push('course_title');
  if (a.department?.id !== b.department?.id) diffs.push('department');
  if (a.level !== b.level) diffs.push('level');
  if (a.creditHours !== b.creditHours) diffs.push('credit_hours');
  if ([...a.prerequisites].sort().join() !== [...b.prerequisites].sort().join()) diffs.push('prerequisite_course_codes');
  return diffs;
};

/**
 * Validates every row. `lookups`:
 *   departments  Map<CODE | lowercased name, { id, code, name }>
 *   programmes   Map<CODE, { id, code, durationYears }>
 *   academicYears Map<name, { id, name }>
 *   courses      Map<CODE, { id, level }>   — existing courses (and existing prerequisite targets)
 *
 * Returns `{ results, courses }`: one result per row
 * (`{ index, line, courseCode, programme, status: valid|invalid|duplicate, errors }`) and, for the
 * valid ones, the new courses to create keyed by code (`{ code, rows: [normalised rows] }`).
 */
export const validateCatalog = (rawRows, lookups) => {
  const checked = rawRows.map((raw, index) => checkRow(raw ?? {}, index, lookups));
  const results = checked.map(({ row, errors }) => ({
    index: row.index, line: row.line, courseCode: row.code, programme: row.programmeCode, status: errors.length ? 'invalid' : 'valid', errors,
  }));
  const fail = (index, status, message) => {
    const r = results[index];
    if (r.status === 'valid') r.status = status;
    else if (status === 'duplicate') r.status = 'duplicate';
    r.errors.push(message);
  };

  // Duplicates: an existing course is never touched; a repeated code + programme counts once.
  const seenPair = new Map();
  for (const { row } of checked) {
    if (row.code && lookups.courses.has(row.code)) {
      fail(row.index, 'duplicate', `Course ${row.code} already exists — it was not changed`);
      continue;
    }
    const key = `${row.code}|${row.programmeCode}`;
    if (row.code && row.programmeCode && seenPair.has(key)) {
      fail(row.index, 'duplicate', `Repeats line ${seenPair.get(key)} (same course and programme)`);
    } else if (row.code && row.programmeCode) seenPair.set(key, row.line);
  }

  // Rows of one course (shared by programmes) must describe the same course.
  const courses = new Map();
  for (const { row } of checked) {
    if (results[row.index].status !== 'valid') continue;
    const group = courses.get(row.code);
    if (!group) {
      courses.set(row.code, { code: row.code, rows: [row] });
      continue;
    }
    const diffs = sameCourse(group.rows[0], row);
    if (diffs.length) fail(row.index, 'invalid', `Conflicts with line ${group.rows[0].line} for ${row.code} (${diffs.join(', ')} differ)`);
    else group.rows.push(row);
  }

  // Prerequisites must exist (already, or as a valid new course here) and not be at a higher level.
  // Removing a course can orphan another's prerequisite, so repeat until nothing changes.
  const invalidateCourse = (code, message) => {
    for (const r of courses.get(code).rows) fail(r.index, 'invalid', message);
    courses.delete(code);
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const [code, { rows }] of [...courses]) {
      const course = rows[0];
      for (const pre of course.prerequisites) {
        const existing = lookups.courses.get(pre);
        const incoming = courses.get(pre)?.rows[0];
        if (!existing && !incoming) {
          invalidateCourse(code, `Prerequisite ${pre} does not exist and is not a valid course in this file`);
          changed = true;
          break;
        }
        const preLevel = existing?.level ?? incoming.level;
        if (preLevel > course.level) {
          invalidateCourse(code, `Prerequisite ${pre} is a level ${preLevel} course, above this level ${course.level} course`);
          changed = true;
          break;
        }
      }
    }
  }

  // No prerequisite cycles among the new courses (existing courses can't point at new ones).
  const state = new Map(); // code → 'visiting' | 'done'
  const cyclic = new Set();
  const visit = (code, path) => {
    if (state.get(code) === 'done' || !courses.has(code)) return;
    if (state.get(code) === 'visiting') {
      path.slice(path.indexOf(code)).forEach((c) => cyclic.add(c));
      return;
    }
    state.set(code, 'visiting');
    for (const pre of courses.get(code).rows[0].prerequisites) visit(pre, [...path, code]);
    state.set(code, 'done');
  };
  for (const code of courses.keys()) visit(code, []);
  for (const code of cyclic) invalidateCourse(code, `Prerequisites form a cycle involving ${[...cyclic].join(', ')}`);

  return { results, courses };
};

/** New courses in an order where every in-file prerequisite comes before the course that needs it. */
export const importOrder = (courses) => {
  const ordered = [];
  const placed = new Set();
  const place = (code) => {
    if (placed.has(code) || !courses.has(code)) return;
    placed.add(code);
    for (const pre of courses.get(code).rows[0].prerequisites) place(pre);
    ordered.push(courses.get(code));
  };
  for (const code of courses.keys()) place(code);
  return ordered;
};

export const summarize = (results, extra = {}) => {
  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    total: results.length,
    valid: count('valid'),
    invalid: count('invalid'),
    duplicates: count('duplicate'),
    imported: count('imported'),
    failed: count('failed'),
    ...extra,
    rows: results,
  };
};
