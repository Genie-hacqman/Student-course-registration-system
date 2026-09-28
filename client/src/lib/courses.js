import { lecturerName } from './format'

const RANK = { registered: 0, eligible: 1, full: 2, blocked: 3 }

/** A course's overall status is its most favourable section's. Shared by the catalog and the registration wizard. */
export const summarize = (course) => {
  const best = [...course.sections].sort((a, b) => RANK[a.status] - RANK[b.status])[0]
  return {
    status: best?.status ?? 'blocked',
    reason: best?.status === 'blocked' ? best.reasons?.[0] : null,
    reasons: best?.status === 'blocked' ? best.reasons ?? [] : [],
    capacity: course.sections.reduce((n, s) => n + s.capacity, 0),
    seatsTaken: course.sections.reduce((n, s) => n + s.seatsTaken, 0),
    seatsAvailable: course.sections.reduce((n, s) => n + s.seatsAvailable, 0),
    lecturers: [...new Set(course.sections.map((s) => lecturerName(s.lecturer)))],
  }
}
