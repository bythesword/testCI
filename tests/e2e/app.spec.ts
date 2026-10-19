import { expect, test } from '@playwright/test'

test('renders the initial counter state', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('counter-initial.png')
})

test('increments the counter and updates the snapshot', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+1' }).click()
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: '+1' }).blur()
  await expect(page.locator('#count')).toHaveText('Count is 1')
  await expect(page).toHaveScreenshot('counter-incremented.png')
})
