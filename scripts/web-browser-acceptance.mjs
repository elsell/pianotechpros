import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const catalog = JSON.parse(await readFile(new URL('../packages/i18n/src/locales/es.json', import.meta.url), 'utf8'))
const baseURL = process.env.WEB_ACCEPTANCE_BASE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ locale: 'es-ES' })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  await page.goto(baseURL)
  assert.equal(await page.locator('html').getAttribute('lang'), 'es')
  await page.getByText(catalog['app.ready'], { exact: true }).waitFor()
  const authorizationRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/dex/auth')
  await page.getByRole('button', { name: catalog['auth.signIn'], exact: true }).click()
  const authorizationURL = new URL((await authorizationRequest).url())
  assert.equal(authorizationURL.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(authorizationURL.searchParams.get('code_challenge'))
  await page.locator('input[name=login]').fill('developer@example.com')
  await page.locator('input[name=password]').fill('password')
  const profileResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.request().method() === 'GET')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  const response = await profileResponse
  assert.equal(response.status(), 200)
  const { data: profile } = await response.json()
  assert.equal(profile.email, 'developer@example.com')
  const signedInCopy = catalog['auth.signedInAs'].replace('{{name}}', profile.displayName || profile.email)
  await page.getByText(signedInCopy, { exact: true }).waitFor()
  await page.reload()
  await page.getByText(signedInCopy, { exact: true }).waitFor()
  const revoked = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/session' && response.request().method() === 'DELETE')
  await page.getByRole('button', { name: catalog['auth.signOut'], exact: true }).click()
  assert.equal((await revoked).status(), 204)
  await page.getByRole('button', { name: catalog['auth.signIn'], exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: catalog['auth.signIn'], exact: true }).waitFor()
  console.log('Web browser Spanish rendering, PKCE sign-in, restoration and sign-out acceptance passed')
} finally {
  await browser.close()
}
