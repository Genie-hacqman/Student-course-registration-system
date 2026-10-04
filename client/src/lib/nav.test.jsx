import { describe, expect, it } from 'vitest'
import { navForUser } from './nav.js'

// The default permissions (server/src/utils/constants.js ROLE_PERMISSIONS).
const ADMIN = ['user:manage', 'student:admit', 'application:review', 'course:manage', 'registration:view_all', 'report:view',
  'audit:view', 'settings:manage', 'account:approve', 'role:manage', 'announcement:create', 'directory:view']
const REGISTRAR = ['course:catalog', 'lecturer:assign', 'semester:manage', 'section:manage', 'registration:approve',
  'registration:manage', 'registration:view_all', 'prerequisite:override', 'roster:view', 'grade:manage', 'attendance:record',
  'report:view', 'announcement:create', 'directory:view']
const labels = (user) => navForUser(user).map((e) => e.label)

describe('staff navigation by role', () => {
  it('admins get people and structure sections first, in the required order', () => {
    const nav = labels({ role: { name: 'ADMIN' }, permissions: ADMIN })
    expect(nav.slice(0, 11)).toEqual([
      'Dashboard', 'Students', 'Lecturers', 'Departments', 'Programmes', 'Administrators & Registrars', 'All Users',
      'Course Offerings', 'Enrolments & Registration', 'Audit Logs', 'Admissions',
    ])
    expect(nav).not.toContain('Payments') // there is no payments feature, so no menu item for it
  })

  it('registrars browse the directories but see no account pages or audit logs', () => {
    const nav = labels({ role: { name: 'REGISTRAR' }, permissions: REGISTRAR })
    expect(nav.slice(0, 7)).toEqual(['Dashboard', 'Students', 'Lecturers', 'Departments', 'Programmes', 'Course Offerings', 'Enrolments & Registration'])
    for (const hidden of ['Administrators & Registrars', 'All Users', 'Audit Logs']) expect(nav).not.toContain(hidden)
  })

  it('without directory:view, a registrar loses the department, programme and lecturer pages but keeps Students', () => {
    const nav = labels({ role: { name: 'REGISTRAR' }, permissions: REGISTRAR.filter((p) => p !== 'directory:view') })
    for (const hidden of ['Lecturers', 'Departments', 'Programmes']) expect(nav).not.toContain(hidden)
    expect(nav).toContain('Students')
  })

  it('admins see offerings read-only through directory:view; the group shows only what they may open', () => {
    const offerings = navForUser({ role: { name: 'ADMIN' }, permissions: ADMIN }).find((e) => e.label === 'Course Offerings')
    expect(offerings.items.map((i) => i.label)).toEqual(['Offerings', 'Courses'])
  })
})
