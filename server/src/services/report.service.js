import { QueryTypes } from 'sequelize';
import { sequelize } from '../models/index.js';
import * as semesterService from './semester.service.js';
import { NotFoundError } from '../utils/errors.js';
import { PERMISSIONS } from '../utils/constants.js';
import { hasPermission } from './permission.service.js';

const resolveSemesterId = async (semesterId) => {
  if (semesterId) return semesterId;
  const current = await semesterService.findCurrent();
  if (!current) throw new NotFoundError('Current semester');
  return current.id;
};

/** Seat fill rate and waitlist demand per section, most in-demand first. */
export const coursePopularity = async ({ semesterId } = {}) => {
  const id = await resolveSemesterId(semesterId);
  const rows = await sequelize.query(
    `SELECT s.id AS sectionId, c.id AS courseId, c.code, c.title, s.section_code AS sectionCode,
            s.capacity, s.seats_taken AS seatsTaken,
            ROUND(s.seats_taken / s.capacity * 100, 1) AS fillRate,
            (SELECT COUNT(*) FROM waitlists w
              WHERE w.course_section_id = s.id AND w.status IN ('waiting', 'notified')) AS waitlisted
       FROM course_sections s
       JOIN courses c ON c.id = s.course_id
      WHERE s.semester_id = :semesterId AND s.status <> 'cancelled'
      ORDER BY fillRate DESC, waitlisted DESC, c.code ASC`,
    { replacements: { semesterId: id }, type: QueryTypes.SELECT },
  );
  return {
    semesterId: id,
    sections: rows.map((r) => ({
      ...r,
      fillRate: Number(r.fillRate),
      waitlisted: Number(r.waitlisted),
    })),
  };
};

export const registrationSummary = async ({ semesterId } = {}) => {
  const id = await resolveSemesterId(semesterId);

  const byStatus = await sequelize.query(
    `SELECT status, COUNT(*) AS count, ROUND(AVG(total_credits), 1) AS avgCredits
       FROM registrations WHERE semester_id = :semesterId GROUP BY status`,
    { replacements: { semesterId: id }, type: QueryTypes.SELECT },
  );
  const [totals] = await sequelize.query(
    `SELECT COUNT(DISTINCT r.student_id) AS students,
            COUNT(ri.id) AS registeredItems,
            COALESCE(SUM(ri.credits), 0) AS totalCredits
       FROM registrations r
       LEFT JOIN registration_items ri ON ri.registration_id = r.id AND ri.status = 'registered'
      WHERE r.semester_id = :semesterId`,
    { replacements: { semesterId: id }, type: QueryTypes.SELECT },
  );

  return {
    semesterId: id,
    students: Number(totals.students),
    registeredItems: Number(totals.registeredItems),
    totalCredits: Number(totals.totalCredits),
    byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count), avgCredits: Number(r.avgCredits) })),
  };
};

const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

/**
 * One payload for the admin and registrar dashboards: people, academic structure, and this
 * semester's registration progress. "Not started" means an active student with no live registration.
 */
export const overview = async ({ semesterId } = {}, actor) => {
  const id = await resolveSemesterId(semesterId);

  const [usersByRole, [totals], byProgram, byLevel, byStatus, [{ notStarted }], activity] = await Promise.all([
    select(`SELECT r.name AS role, COUNT(u.id) AS total, COALESCE(SUM(u.status = 'active'), 0) AS active
              FROM roles r LEFT JOIN users u ON u.role_id = r.id GROUP BY r.id, r.name ORDER BY r.id`),
    select(`SELECT
              (SELECT COUNT(*) FROM students) AS students,
              (SELECT COUNT(*) FROM students s JOIN users u ON u.id = s.user_id
                WHERE s.status = 'active' AND u.status = 'active') AS activeStudents,
              (SELECT COUNT(*) FROM lecturers) AS lecturers,
              (SELECT COUNT(*) FROM programs) AS programs,
              (SELECT COUNT(*) FROM departments) AS departments,
              (SELECT COUNT(*) FROM courses) AS courses,
              (SELECT COUNT(*) FROM courses WHERE status = 'active') AS activeCourses,
              (SELECT COUNT(*) FROM course_sections WHERE semester_id = :id AND status <> 'cancelled') AS sections`, { id }),
    select(`SELECT p.id AS programId, p.code, p.name, COUNT(s.id) AS count
              FROM programs p LEFT JOIN students s ON s.program_id = p.id AND s.status = 'active'
             GROUP BY p.id, p.code, p.name ORDER BY count DESC, p.code`),
    select(`SELECT level, COUNT(*) AS count FROM students WHERE status = 'active' GROUP BY level ORDER BY level`),
    select(`SELECT status, COUNT(*) AS count FROM registrations WHERE semester_id = :id GROUP BY status`, { id }),
    select(`SELECT COUNT(*) AS notStarted
              FROM students s JOIN users u ON u.id = s.user_id
             WHERE s.status = 'active' AND u.status = 'active'
               AND NOT EXISTS (SELECT 1 FROM registrations r
                                WHERE r.student_id = s.id AND r.semester_id = :id AND r.status <> 'cancelled')`, { id }),
    select(`SELECT DATE(submitted_at) AS date, COUNT(*) AS count FROM registrations
             WHERE semester_id = :id AND submitted_at IS NOT NULL GROUP BY DATE(submitted_at) ORDER BY date`, { id }),
  ]);

  const statusCounts = { draft: 0, submitted: 0, approved: 0, rejected: 0, cancelled: 0 };
  byStatus.forEach((r) => { statusCounts[r.status] = Number(r.count); });
  const activeStudents = Number(totals.activeStudents);
  const counted = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)]));

  let activityLast24h = null;
  if (hasPermission(actor.role, PERMISSIONS.AUDIT_VIEW)) {
    const [{ count }] = await select('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at >= NOW() - INTERVAL 1 DAY');
    activityLast24h = Number(count);
  }

  const users = usersByRole.map((r) => ({ role: r.role, total: Number(r.total), active: Number(r.active) }));
  return {
    semesterId: id,
    users: {
      total: users.reduce((n, r) => n + r.total, 0),
      active: users.reduce((n, r) => n + r.active, 0),
      byRole: users,
    },
    totals: counted,
    studentsByProgram: byProgram.map((r) => ({ ...r, count: Number(r.count) })),
    studentsByLevel: byLevel.map((r) => ({ level: Number(r.level), count: Number(r.count) })),
    registrations: {
      byStatus: statusCounts,
      notStarted: Number(notStarted),
      // Anyone active who isn't approved or awaiting approval still has registering to do.
      notRegistered: Math.max(0, activeStudents - statusCounts.approved - statusCounts.submitted),
      completionRate: activeStudents ? Math.round((statusCounts.approved / activeStudents) * 1000) / 10 : 0,
    },
    registrationActivity: activity.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      count: Number(r.count),
    })),
    activityLast24h,
  };
};
