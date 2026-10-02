import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '..', 'server', 'package.json'))

export const PHOTO = path.join(here, 'fixtures', 'photo.png')
export const NOT_A_PICTURE = path.join(here, 'fixtures', 'not-a-picture.txt')

// The same fallbacks the seeder uses, so the suite works with or without a server/.env.
export const ACCOUNTS = {
  admin: [process.env.SEED_ADMIN_EMAIL || 'admin@scrs.local', process.env.SEED_ADMIN_PASSWORD || 'Admin@12345'],
  registrar: ['registrar@scrs.local', 'Registrar@12345'],
  lecturer: ['lecturer@scrs.local', 'Lecturer@12345'],
  student: ['student@scrs.local', 'Student@12345'],
}
export const APPLICANT_PASSWORD = 'Applicant1pass'

/** Runs one statement against the test database (e.g. to confirm an email, which normally needs the emailed link). */
export async function sql(statement, params = []) {
  const mysql = require('mysql2/promise')
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || undefined,
    database: `${process.env.DB_NAME}_test`,
  })
  try {
    const [rows] = await connection.query(statement, params)
    return rows
  } finally {
    await connection.end()
  }
}

/** Signs in through the real login form. `tab` is the "Sign in as" tab: Staff (email), Applicant, or Student. */
export async function signIn(page, email, password, tab = 'Staff') {
  await page.goto('/login')
  await page.getByRole('tab', { name: tab }).click()
  await page.getByLabel(tab === 'Applicant' ? 'Personal email' : 'Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Picks a photo in the AvatarUploader on the current page, previews it, and saves it. */
export async function uploadPicture(page, file = PHOTO) {
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Save picture' }).click()
  await expect(page.getByText('Profile picture saved')).toBeVisible()
}
