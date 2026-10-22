import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';

const webURL = process.env.DEALER_WEB_URL || 'http://127.0.0.1:5179';
const shops = new Map(['atelier', 'studio'].map((id) => [id, { id, name: id === 'atelier' ? 'Atelier Pianos' : 'Studio Pianos', email: `${id}@example.com`, slug: id, revision: 1, accent_color: '#123456', showroom_published: false }]));
let firstPageReads = 0;
let releaseRefresh;
let refreshRequested;
const requestedRefresh = new Promise((resolve) => { refreshRequested = resolve; });
const heldRefresh = new Promise((resolve) => { releaseRefresh = resolve; });
let releaseDetail;
let detailRequested;
const requested = new Promise((resolve) => { detailRequested = resolve; });
const held = new Promise((resolve) => { releaseDetail = resolve; });
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', webURL);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.headers.authorization !== 'Bearer browser-test-session') return send(401, { code: 'unauthenticated' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/v1/session/refresh') { refreshRequested(); await heldRefresh; return send(200, { data: { token: 'late-replacement', expiresAt: new Date(Date.now() + 3600000).toISOString() } }); }
  if (url.pathname === '/v1/me') return send(200, { data: { id: 'test-owner', email: 'owner@example.com', displayName: 'Owner' } });
  if (url.pathname === '/v1/session' && req.method === 'DELETE') { res.writeHead(204).end(); return; }
  if (url.pathname === '/v1/dealers' && !url.searchParams.has('cursor') && ++firstPageReads === 2) return send(503, { code: 'unavailable' });
  if (url.pathname === '/v1/dealers') return send(200, url.searchParams.has('cursor') ? { data: [...shops.values()], meta: {} } : { data: [], meta: { nextCursor: 'authorized-next-page' } });
  const id = url.pathname.split('/').at(-1);
  if (id === 'atelier') { detailRequested(); await held; }
  const shop = shops.get(id);
  return send(shop ? 200 : 404, shop ? { data: shop } : { code: 'not_found' });
});
server.listen(8089, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: 'es-ES' });
  await context.addInitScript(() => window.sessionStorage.setItem('pianotechpros_application_session', JSON.stringify({ token: 'browser-test-session', expiresAt: new Date(Date.now() + 3600000).toISOString() })));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(webURL);
  await page.getByRole('heading', { name: 'Tus tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Actualizar tiendas', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  assert.equal(firstPageReads, 3);
  await page.getByRole('button', { name: 'Studio Pianos', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Studio Pianos', exact: true }).waitFor();
  assert.ok(await page.getByText('studio@example.com', { exact: true }).isVisible());
  await page.screenshot({ path: '/tmp/piano-dealer-web-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-dealer-web-narrow.png', fullPage: true });
  await page.getByRole('button', { name: 'Atelier Pianos', exact: true }).click();
  await requested;
  assert.equal(await page.getByRole('heading', { name: 'Studio Pianos', exact: true }).count(), 0);
  const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/v1/dealers/atelier');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  releaseDetail();
  await (await lateResponse).finished();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tus tiendas', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('pianotechpros_application_session')), null);
  await page.screenshot({ path: '/tmp/piano-dealer-web-signed-out.png', fullPage: true });
  await page.evaluate(async () => {
    const auth = await import('/src/lib/auth.ts');
    sessionStorage.setItem('pianotechpros_application_session', JSON.stringify({ token: 'browser-test-session', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
    window.refreshResult = auth.refreshApplicationSession({ environment: 'development', apiURL: 'http://127.0.0.1:8089', oidcIssuer: 'http://localhost:5556/dex', oidcClientId: 'pianotechpros-web' }).then(() => 'restored', () => 'discarded');
  });
  await requestedRefresh;
  await page.evaluate(() => sessionStorage.removeItem('pianotechpros_application_session'));
  releaseRefresh();
  assert.equal(await page.evaluate(() => window.refreshResult), 'discarded');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('pianotechpros_application_session')), null);
  console.log('Dealer web Spanish pagination, keyboard selection, responsive layout and late read/refresh sign-out isolation passed');
} finally { releaseRefresh(); releaseDetail(); await browser.close(); server.close(); }
