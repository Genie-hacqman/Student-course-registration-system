import { test, expect } from '@playwright/test'
import {
  ACCOUNTS, APPLICANT_PASSWORD, NOT_A_PICTURE, PHOTO, signIn, sql, uploadPicture,
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

test('an admitted student can replace their picture but never remove it', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.student)
  await page.goto('/student/profile')
  await uploadPicture(page)
  await expect(page.getByRole('button', { name: 'Change picture' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  await expect(headerPhoto(page)).toBeVisible()
})

test.describe.serial('admission: the passport photo is mandatory, and reviewers see it', () => {
  const email = 'ada.e2e@personal.test'

  test('the applicant cannot submit until a photo is added', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: 'Passport photo' })).toBeVisible()
    await expect(submit).toBeDisabled()
    await expect(page.getByText('Add your passport photo above before submitting.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled()

    await uploadPicture(page)
    await expect(submit).toBeEnabled()
    await expect(page.getByText('Add your passport photo above before submitting.')).toHaveCount(0)

    await submit.click()
    await expect(page.getByRole('heading', { name: 'Your application is under review' })).toBeVisible()
  })

  test('the admin sees the photo on the list and the application, and admits the applicant', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.admin)
    await page.goto('/staff/applications')
    const row = page.getByRole('row', { name: /Ada Applicant/ })
    await expect(row.getByRole('img', { name: /photo/i })).toBeVisible()

    await row.click()
    await expect(page.getByRole('img', { name: "Ada Applicant's photo" })).toBeVisible()
    await page.getByRole('button', { name: 'Admit', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Admit', exact: true }).click()
    await expect(page.getByText(/Admitted as STU/)).toBeVisible()

    // The same picture now identifies the new student in the student list.
    await page.goto('/staff/students')
    await expect(page.getByRole('row', { name: /Ada Applicant/ }).getByRole('img', { name: /photo/i })).toBeVisible()
  })
})
