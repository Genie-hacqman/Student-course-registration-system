import crypto from 'node:crypto'
import fs from 'node:fs'
import { test, expect } from '@playwright/test'
import {
  ACCOUNTS, APPLICANT_PASSWORD, NOT_A_PICTURE, PHOTO, signIn, sql, uploadOfficialPhoto, uploadPicture,
} from './helpers.js'

const headerPhoto = (page) => page.locator('header').getByRole('img', { name: /photo/i })

// Staff roles can all add, replace and remove their own picture from their account page.
for (const [who, account] of [['admin', '/staff/account'], ['registrar', '/staff/account'], ['lecturer', '/lecturer/account']]) {
  test(`${who}: adds a picture, sees it in the header, then removes it`, async ({ page }) => {
    await signIn(page, ...ACCOUNTS[who])
    await expect(page.getByText('Add a profile picture so people can recognise you.')).toBeVisible()
    await expect(headerPhoto(page)).toHaveCount(0)

    await page.goto(account)
    await expect(page.getByRole('heading', { name: 'Profile picture' })).toBeVisible()
    await uploadPicture(page)
    await expect(headerPhoto(page)).toBeVisible()
    await expect(page.getByText('Add a profile picture so people can recognise you.')).toHaveCount(0)

    // It survives a reload (it is stored on the server, not just in the page).
    await page.reload()
    await expect(headerPhoto(page)).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Profile picture removed')).toBeVisible()
    await expect(headerPhoto(page)).toHaveCount(0)
  })
}

test('a file that is not a picture is refused with a clear message', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.lecturer)
  await page.goto('/lecturer/account')
  await page.locator('input[type=file]').setInputFiles(NOT_A_PICTURE)
  await expect(page.getByRole('alert')).toContainText('JPG, PNG or WebP')
  await expect(page.getByRole('button', { name: 'Save picture' })).toHaveCount(0)
})

test('Cancel drops a previewed picture without saving it', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.registrar)
  await page.goto('/staff/account')
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await expect(page.getByRole('button', { name: 'Save picture' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Upload picture' })).toBeVisible()
  await expect(headerPhoto(page)).toHaveCount(0)
})

test('an admitted student can change and remove their profile picture (it is optional)', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.student)
  await page.goto('/student/profile')
  await uploadPicture(page)
  await expect(page.getByRole('button', { name: 'Change picture' })).toBeVisible()
  await expect(headerPhoto(page)).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Profile picture removed')).toBeVisible()
  await expect(headerPhoto(page)).toHaveCount(0)
})

test.describe.serial('admission: the official application photo is mandatory, then locked', () => {
  const email = 'ada.e2e@personal.test'

  test('the applicant cannot submit without a photo; can replace and remove it while a draft', async ({ page }) => {
    await page.goto('/apply')
    await page.getByLabel('First name').fill('Ada')
    await page.getByLabel('Last name').fill('Applicant')
    await page.getByLabel('Personal email').fill(email)
    await page.getByLabel(/^Password/).fill(APPLICANT_PASSWORD)
    await page.getByLabel('Confirm password').fill(APPLICANT_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/student\/admission/)

    // The emailed confirmation link is out of reach here, so confirm the address directly.
    await sql('UPDATE users SET email_verified_at = NOW() WHERE email = ?', [email])
    await page.reload()

    await page.getByLabel('Date of birth').fill('2005-04-12')
    await page.getByLabel('Phone number').fill('+233 24 123 4567')
    await page.getByLabel('Department').selectOption({ index: 1 })
    await page.getByLabel('Programme').selectOption({ index: 1 })
    await page.getByLabel('Entry level').selectOption({ index: 1 })

    const submit = page.getByRole('button', { name: 'Submit application' })
    await expect(page.getByRole('heading', { name: 'Applicant Photo' })).toBeVisible()
    await expect(submit).toBeDisabled()
    await expect(page.getByText('Add your applicant photo above before submitting.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled()

    // Upload, replace, remove, upload again: all allowed while it is a draft, and typed details survive each step.
    await uploadOfficialPhoto(page)
    await expect(submit).toBeEnabled()
    await expect(page.getByLabel('Phone number')).toHaveValue('+233 24 123 4567')
    await uploadOfficialPhoto(page)
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Photo removed')).toBeVisible()
    await expect(submit).toBeDisabled()
    await uploadOfficialPhoto(page)
    await expect(submit).toBeEnabled()

    // A profile picture is a different thing: setting and removing it never touches the official photo.
    await page.goto('/student/settings')
    await uploadPicture(page)
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Profile picture removed')).toBeVisible()
    await page.goto('/student/admission')
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()
    await expect(page.getByAltText('Your application photo')).toBeVisible()

    await page.getByLabel('Date of birth').fill('2005-04-12')
    await page.getByLabel('Phone number').fill('+233 24 123 4567')
    await page.getByLabel('Department').selectOption({ index: 1 })
    await page.getByLabel('Programme').selectOption({ index: 1 })
    await page.getByLabel('Entry level').selectOption({ index: 1 })
    await submit.click()
    await expect(page.getByRole('heading', { name: 'Your application is under review' })).toBeVisible()
  })

  test('after submitting the photo is read-only and locked, in the page and in the API', async ({ page }) => {
    await signIn(page, email, APPLICANT_PASSWORD, 'Applicant')
    await page.goto('/student/admission')
    await expect(page.getByText('Locked after submission')).toBeVisible()
    await expect(page.getByText('Official Application Photo')).toBeVisible()
    await expect(page.getByAltText('Official application photo')).toBeVisible()
    await expect(page.getByRole('button', { name: /replace|remove|upload/i })).toHaveCount(0)

    // Even by calling the API directly with the session the page holds, the backend refuses.
    const token = await page.evaluate(async ({ email, password }) => {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password }) })
      return (await res.json()).data.accessToken
    }, { email, password: APPLICANT_PASSWORD })
    const refused = await page.request.delete('/api/applications/me/photo', { headers: { Authorization: `Bearer ${token}` } })
    expect(refused.status()).toBe(409)
    const refusedPut = await page.request.put('/api/applications/me/photo', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, data: fs.readFileSync(PHOTO),
    })
    expect(refusedPut.status()).toBe(409)
  })

  test('the admin sees the Official Application Photo with the application number, and admits the applicant', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.admin)
    await page.goto('/staff/applications')
    const row = page.getByRole('row', { name: /Ada Applicant/ })
    await row.click()
    await expect(page).toHaveURL(/applications\/\d+/)
    await expect(page.getByText('Official Application Photo')).toBeVisible()
    await expect(page.getByAltText('Official application photo')).toBeVisible()
    await expect(page.getByText(/Application APP\d{6}/)).toBeVisible()

    await page.getByRole('button', { name: 'Admit', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Admit', exact: true }).click()
    await expect(page.getByText(/Admitted as STU/)).toBeVisible()

    // The original stays on the application, and the new student starts with a copy as their profile picture.
    await expect(page.getByAltText('Official application photo')).toBeVisible()
    await page.goto('/staff/students')
    await expect(page.getByRole('row', { name: /Ada Applicant/ }).getByRole('img', { name: /photo/i })).toBeVisible()
  })

  test('the reported case: the student removes their profile picture; admin and registrar still see the photo they applied with', async ({ page, browser }) => {
    // Activate the new student (the emailed link is out of reach, so plant a known token the way the server stores it).
    const [{ id: userId }] = await sql('SELECT id FROM users WHERE first_name = ? AND last_name = ?', ['Ada', 'Applicant'])
    const raw = 'e2e-activation-token-'.padEnd(48, 'x')
    await sql('UPDATE users SET activation_hash = ? WHERE id = ?', [crypto.createHash('sha256').update(raw).digest('hex'), userId])
    const activated = await page.request.post('/api/applications/activate', { data: { token: raw, pin: '482915', confirmPin: '482915' } })
    expect(activated.status()).toBe(200)
    const { studentNumber } = (await activated.json()).data

    // The student signs in, sees the copy of their application photo as their profile picture, and removes it.
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Student' }).click()
    await page.getByLabel('Student ID').fill(studentNumber)
    await page.getByLabel('PIN').fill('482915')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/student/profile')
    await expect(headerPhoto(page)).toBeVisible()
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Profile picture removed')).toBeVisible()
    await expect(headerPhoto(page)).toHaveCount(0)

    // The registrar opens the student's record: the official photo and the application are both there.
    const registrarContext = await browser.newContext()
    const registrarPage = await registrarContext.newPage()
    await signIn(registrarPage, ...ACCOUNTS.registrar)
    await registrarPage.goto('/staff/students')
    await registrarPage.getByRole('row', { name: /Ada Applicant/ }).click()
    await expect(registrarPage.getByAltText('Official application photo')).toBeVisible()
    await expect(registrarPage.getByText('Official Application Photo')).toBeVisible()
    await expect(registrarPage.getByText(/Application APP\d{6}/)).toBeVisible()
    await expect(registrarPage.getByRole('heading', { name: 'Admission application' })).toBeVisible()
    await expect(registrarPage.getByText('ada.e2e@personal.test')).toBeVisible()
    await expect(registrarPage.getByRole('link', { name: 'View full application' })).toHaveCount(0)
    await registrarContext.close()

    // The admin sees it on the record too, and as a thumbnail in the applications list.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await signIn(adminPage, ...ACCOUNTS.admin)
    await adminPage.goto('/staff/students')
    await adminPage.getByRole('row', { name: /Ada Applicant/ }).click()
    await expect(adminPage.getByAltText('Official application photo')).toBeVisible()
    await expect(adminPage.getByRole('link', { name: 'View full application' })).toBeVisible()
    await adminPage.goto('/staff/applications')
    await adminPage.getByRole('tab', { name: 'Admitted', exact: true }).click()
    await expect(adminPage.getByAltText("Ada Applicant's application photo")).toBeVisible()
    await adminContext.close()
  })
})
