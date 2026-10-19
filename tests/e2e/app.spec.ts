import { expect, test } from '@playwright/test'

test('lists examples and opens the counter page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '示例' })).toBeVisible()
  await expect(page.getByRole('link', { name: '计数器' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'WebGPU 彩色三角形' })).toBeVisible()

  await page.getByRole('link', { name: '计数器' }).click()
  await expect(page).toHaveURL(/\/counter\.html$/)
  await expect(page.getByRole('heading', { name: '计数器' })).toBeVisible()
  await expect(page).toHaveScreenshot('counter-initial.png')
})

test('increments the counter and updates the snapshot', async ({ page }) => {
  await page.goto('/counter.html')
  await page.getByRole('button', { name: '+1' }).click()
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: '+1' }).blur()
  await expect(page.locator('#count')).toHaveText('Count is 1')
  await expect(page).toHaveScreenshot('counter-incremented.png')
})
