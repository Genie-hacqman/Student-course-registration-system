import { test, expect } from '@playwright/test'

/**
 * The sign-in card animates its own height to fit its content. Its last element (the "Apply for admission" button
 * on Sign in) must always be fully inside it: the card once clipped the bottom few pixels of whatever came last.
 */
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`${name}: nothing at the bottom of the sign-in card is clipped`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport })).newPage()
    await page.goto('/login')

    // Clicking a control while the page is still animating in must not shift the layout. The scaled-up background
    // photo once made the (hidden) page scrollable by a few dozen pixels, so an early click scrolled everything
    // up and to the left.
    await page.getByRole('tab', { name: 'Student' }).click()
    await page.waitForTimeout(400)
    const scrolled = await page.evaluate(() => { const root = document.querySelector('#root > div'); return [root.scrollLeft, root.scrollTop] })
    expect(scrolled, 'the sign-in page has not been scrolled by the click').toEqual([0, 0])

    const apply = page.getByRole('link', { name: /apply for admission/i })
    await expect(apply).toBeVisible()
    await expect(apply).toHaveAttribute('href', '/apply')
    await page.waitForTimeout(1200) // the card finishes rising and resizing

    for (const tab of ['Student', 'Applicant']) {
      await page.getByRole('tab', { name: tab }).click()
      await page.waitForTimeout(700)
      const { linkBottom, clipBottom, cardBottom } = await page.evaluate(() => {
        const card = document.querySelector('.auth-glass')
        const link = [...card.querySelectorAll('a')].find((a) => /apply for admission/i.test(a.textContent))
        const clip = [...card.querySelectorAll('div')].find((d) => d.style.overflow === 'hidden')
        return { linkBottom: link.getBoundingClientRect().bottom, clipBottom: clip.getBoundingClientRect().bottom, cardBottom: card.getBoundingClientRect().bottom }
      })
      expect(linkBottom, `${tab}: the button's bottom edge is inside the clipping box`).toBeLessThanOrEqual(clipBottom)
      expect(cardBottom - linkBottom, `${tab}: the card keeps its padding below the button`).toBeGreaterThanOrEqual(20)
    }
  })
}
