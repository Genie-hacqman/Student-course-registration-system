/**
 * Letter-grade scale. `rank` orders grades for comparisons ("C or better");
 * W (withdrawn) and I (incomplete) carry no points and never count as a pass or toward GPA.
 */
export const GRADE_SCALE = Object.freeze({
  A: { points: 4.0, rank: 9 },
  'B+': { points: 3.5, rank: 8 },
  B: { points: 3.0, rank: 7 },
  'C+': { points: 2.5, rank: 6 },
  C: { points: 2.0, rank: 5 },
  'D+': { points: 1.5, rank: 4 },
  D: { points: 1.0, rank: 3 },
  E: { points: 0.5, rank: 2 },
  F: { points: 0.0, rank: 1 },
  W: { points: null, rank: 0 },
  I: { points: null, rank: 0 },
});

export const GRADES = Object.keys(GRADE_SCALE);
export const PASSABLE_GRADES = GRADES.filter((g) => GRADE_SCALE[g].points !== null);
export const DEFAULT_PASSING_GRADE = 'D';

export const normalizeGrade = (grade) => String(grade ?? '').trim().toUpperCase();

export const isValidGrade = (grade) => normalizeGrade(grade) in GRADE_SCALE;

/** Points for GPA, or null for W / I. */
export const gradePoint = (grade) => GRADE_SCALE[normalizeGrade(grade)]?.points ?? null;

const rank = (grade) => GRADE_SCALE[normalizeGrade(grade)]?.rank ?? 0;

/** True if `grade` is a real (point-bearing) grade at least as good as `minGrade`. */
export const meetsGrade = (grade, minGrade) => gradePoint(grade) !== null && rank(grade) >= rank(minGrade);

export const isPassing = (grade, passingGrade = DEFAULT_PASSING_GRADE) => meetsGrade(grade, passingGrade);

/**
 * Credit-weighted GPA. When a course was attempted more than once, only the best attempt counts.
 * `results` items: { courseId, grade, credits }.
 */
export const computeGpa = (results, passingGrade = DEFAULT_PASSING_GRADE) => {
  const best = new Map();
  for (const r of results) {
    if (gradePoint(r.grade) === null) continue;
    const current = best.get(r.courseId);
    if (!current || rank(r.grade) > rank(current.grade)) best.set(r.courseId, r);
  }

  let points = 0;
  let creditsAttempted = 0;
  let creditsEarned = 0;
  for (const r of best.values()) {
    points += gradePoint(r.grade) * r.credits;
    creditsAttempted += r.credits;
    if (isPassing(r.grade, passingGrade)) creditsEarned += r.credits;
  }

  return {
    gpa: creditsAttempted ? Math.round((points / creditsAttempted) * 100) / 100 : null,
    creditsAttempted,
    creditsEarned,
  };
};
