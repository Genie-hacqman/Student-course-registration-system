export const ADMIN = { id: 1, firstName: 'System', lastName: 'Administrator', role: { name: 'ADMIN' }, permissions: ['user:manage', 'course:manage', 'registration:view_all', 'directory:view', 'student:admit'] }
export const REGISTRAR = { id: 4, firstName: 'Esi', lastName: 'Boateng', role: { name: 'REGISTRAR' }, permissions: ['registration:view_all', 'directory:view', 'lecturer:assign', 'section:manage', 'course:catalog'] }

export const page = (rows) => ({ data: { data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 } } })
export const plain = (data) => ({ data: { data } })

export const summary = {
  total: 3,
  departments: [
    { id: 1, code: 'CS', name: 'Computer Science', status: 'active', students: 3, programs: [{ id: 1, code: 'BSC-CS', name: 'BSc Computer Science', status: 'active', students: 3, levels: [{ level: 100, students: 1 }, { level: 200, students: 2 }] }] },
    { id: 2, code: 'MATH', name: 'Mathematics', status: 'active', students: 0, programs: [] },
  ],
}

export const student = {
  id: 7, studentNumber: 'STU2025001', level: 200, status: 'active', programId: 1,
  user: { firstName: 'Ama', lastName: 'Mensah', email: 'student@scrs.local' },
  program: { id: 1, code: 'BSC-CS', name: 'BSc Computer Science', department: { id: 1, code: 'CS', name: 'Computer Science' } },
  registration: { semesterId: 2, status: 'draft' },
  admission: { source: 'staff', applicationNumber: null, session: null },
}

export const departmentRows = [
  { id: 1, code: 'CS', name: 'Computer Science', status: 'active', counts: { programs: 1, activePrograms: 1, students: 3, activeStudents: 3, lecturers: 1, courses: 7 } },
  { id: 2, code: 'MATH', name: 'Mathematics', status: 'archived', counts: { programs: 0, activePrograms: 0, students: 0, activeStudents: 0, lecturers: 0, courses: 2 } },
]
