import { test, expect } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers.js'

// Uses only the demo seed: departments CS and MATH, programme BSC-CS, student STU2025001, lecturer STF1001.

test('admin: Departments → Computer Science → its students → a student profile', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin)
  await page.getByRole('link', { name: 'Departments' }).first().click()
  await expect(page).toHaveURL(/\/staff\/departments$/)
  const cs = page.getByRole('row', { name: /Computer Science/ })
  await expect(cs).toBeVisible()
  await cs.click()
  await expect(page.getByRole('heading', { name: 'Computer Science' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true')
  const row = page.getByRole('row', { name: /STU2025001/ })
  await expect(row).toBeVisible()
  await page.getByRole('tab', { name: 'Lecturers' }).click()
  await expect(page.getByRole('row', { name: /STF1001/ })).toContainText('Home department')
  await page.getByRole('tab', { name: 'Students' }).click()
  await page.getByRole('row', { name: /STU2025001/ }).click()
  await expect(page).toHaveURL(/\/staff\/students\/\d+/)
  await expect(page.getByRole('heading', { name: /Ama Mensah/ })).toBeVisible()
})

test('admin: Students page drills down by department, programme and level', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin)
  await page.goto('/staff/students')
  await page.getByRole('button', { name: /CS.*Computer Science/ }).click()
  await page.getByRole('button', { name: /BSC-CS/ }).click()
  await page.getByRole('button', { name: /Level 200/ }).click()
  await expect(page).toHaveURL(/department=\d+.*program=\d+.*level=200/)
  await expect(page.getByRole('row', { name: /STU2025001/ })).toBeVisible()
})

test('registrar: browses the directories read-only, and sees no account pages', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.registrar)
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const item of ['Students', 'Lecturers', 'Departments', 'Programmes']) await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'All Users' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Administrators & Registrars' })).toHaveCount(0)

  await page.goto('/staff/departments')
  await expect(page.getByRole('row', { name: /Computer Science/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /new department/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /archive/i })).toHaveCount(0)

  // Account pages redirect them away.
  await page.goto('/staff/administrators')
  await expect(page).not.toHaveURL(/administrators/)
})
