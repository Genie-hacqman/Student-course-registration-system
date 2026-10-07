export const gpaBySemester = (results = []) => {
  const groups = new Map()
  for (const r of results) {
    if (!r.semester || r.gradePoint === null || r.gradePoint === undefined) continue
    const g = groups.get(r.semester.id) ?? { id: r.semester.id, label: r.semester.name, points: 0, credits: 0 }
    g.points += Number(r.gradePoint) * r.course.credits
    g.credits += r.course.credits
    groups.set(r.semester.id, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.id - b.id)
    .map((g) => ({ label: g.label, value: g.credits ? Math.round((g.points / g.credits) * 100) / 100 : 0 }))
}

export const semesterDates = (semester, record) => {
  if (!semester) return []
  const opens = semester.myRegistrationOpensAt
  const general = semester.registrationStart
  const dates = [
    { label: 'Registration opens', date: general, withTime: true },
    opens && general && new Date(opens).getTime() !== new Date(general).getTime()
      && { label: 'Your registration opens', date: opens, withTime: true, description: 'Priority window' },
    { label: 'Registration deadline', date: semester.registrationEnd, withTime: true },
    { label: 'Add/drop deadline', date: semester.addDropEnd, withTime: true },
    record?.startDate && { label: 'Classes begin', date: `${record.startDate}T00:00:00` },
    record?.endDate && { label: 'Semester ends', date: `${record.endDate}T00:00:00` },
  ]
  return dates.filter((d) => d && d.date)
}

export const upcoming = (dates, now = Date.now()) =>
  dates.filter((d) => new Date(d.date).getTime() >= now).sort((a, b) => new Date(a.date) - new Date(b.date))
