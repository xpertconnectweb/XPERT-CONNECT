import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'
import { makeNamespace } from '../../helpers/namespace'

test('public visitor submits the landing contact form and admin sees the row', async ({
  page,
}, testInfo) => {
  const ns = makeNamespace(testInfo)
  const name = `${ns}visitor`
  const email = `${ns}contact@e2e.test`
  const phone = '5615550199'
  const message = `E2E test ${ns}— please ignore.`

  await page.goto('/#contact')
  await page.getByPlaceholder('Full Name').fill(name)
  await page.getByPlaceholder('Email Address').fill(email)
  await page.getByPlaceholder('Phone Number').fill(phone)
  await page.getByLabel('Service Type').selectOption('legal')
  await page.getByPlaceholder(/tell us about your situation/i).fill(message)

  await page.getByRole('button', { name: /submit request/i }).click()

  await expect(page.getByText(/thanks!.*reach out shortly/i)).toBeVisible({
    timeout: 15_000,
  })

  // Verify the row landed in Supabase before letting the teardown sweep it.
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, email, phone, service, message')
    .eq('email', email)
    .single()
  expect(error).toBeNull()
  expect(data?.name).toBe(name)
  expect(data?.phone).toBe(phone)
  expect(data?.service).toBe('legal')
})

test('phone validation rejects too-short numbers', async ({ page }, testInfo) => {
  const ns = makeNamespace(testInfo)
  await page.goto('/#contact')
  await page.getByPlaceholder('Full Name').fill(`${ns}short-phone`)
  await page.getByPlaceholder('Email Address').fill(`${ns}short@e2e.test`)
  await page.getByPlaceholder('Phone Number').fill('123')
  await page.getByLabel('Service Type').selectOption('legal')
  await page.getByPlaceholder(/tell us about your situation/i).fill(`${ns}msg`)
  await page.getByRole('button', { name: /submit request/i }).click()

  // Either the HTML5 pattern blocks or the JS guard sets status=error.
  await expect(page.getByText(/could not submit/i)).toBeVisible({ timeout: 10_000 }).catch(async () => {
    await expect(page).toHaveURL(/\/#?contact/)
    await expect(page.getByText(/thanks!/i)).not.toBeVisible()
  })
})
