import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';

const webURL = process.env.DEALER_WEB_URL || 'http://127.0.0.1:5179';
const shops = new Map(['atelier', 'studio'].map((id) => [id, { id, name: id === 'atelier' ? 'Atelier Pianos' : 'Studio Pianos', email: `${id}@example.com`, slug: id, revision: 1, accent_color: '#123456', showroom_published: false }]));
let refreshMode = 'failure';
let rotations = 0;
const sessions = new Set(['browser-test-session']);
const members = new Map([['test-owner', { userID: 'test-owner', role: 'owner', revision: 1, active: true, grantPending: false }], ['test-editor', { userID: 'test-editor', role: 'editor', revision: 1, active: true, grantPending: false }]]);
const staffInvitations = new Map();
let staffConflict = true;
let inventoryMode = 'normal';
let editorMode = 'normal';
const captureIntents = new Map();const capturedRecords = new Map();let captureCreates = 0;let loseCapture = true;
let editorWrites = 0;
let editorRecord = { id: 'concert', dealer_id: 'created-shop', revision: 1, status: 'available', attributes: { stock_number: 'concert', title: 'Concert Grand', featured: true }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' };
let denyStaff = false;
let invitationAccepted = false;
let accessChecks = 0;
const joinToken = 'A'.repeat(43);
const creations = new Map();
let createRequests = 0;
let conflictOnce = true;
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
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,idempotency-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (!sessions.has(req.headers.authorization?.replace(/^Bearer /, ''))) return send(401, { code: 'unauthenticated' });
  const url = new URL(req.url, 'http://localhost');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (url.pathname.startsWith('/v1/dealers/created-shop/inventory/captured-')) {
    const id = url.pathname.split('/').at(-1);const record = capturedRecords.get(id);
    if (!record) return send(404, { code: 'not_found' });
    if (req.method === 'PUT') {
      if (body.expectedRevision !== record.revision) return send(409, { code: 'conflict' });
      capturedRecords.set(id, { ...record, revision: record.revision + 1, attributes: body.attributes });
    }
    return send(200, { data: capturedRecords.get(id) });
  }
  if (url.pathname === '/v1/dealers/created-shop/inventory/concert') {
    if (editorMode === 'denied') return send(404, { code: 'not_found' });
    if (req.method === 'PUT') {
      editorWrites++;
      if (body.expectedRevision !== editorRecord.revision) return send(409, { code: 'conflict' });
      editorRecord = { ...editorRecord, revision: editorRecord.revision + 1, attributes: body.attributes };
      // Model a gateway losing the upstream acknowledgement after a commit.
      if (editorMode === 'lose') { editorMode = 'normal'; return send(503, { code: 'unavailable' }); }
    }
    return send(200, { data: editorRecord });
  }
  if (url.pathname === '/v1/dealers/created-shop/inventory') {
    if (inventoryMode !== 'normal') return send(inventoryMode === 'denied' ? 404 : 503, { code: inventoryMode === 'denied' ? 'not_found' : 'unavailable' });
    if (req.method === 'POST') {
      captureCreates++;const key = req.headers['idempotency-key'];assert.ok(typeof key === 'string' && key.length >= 16);
      if (!captureIntents.has(key)) {
        const id = `captured-${captureIntents.size + 1}`;captureIntents.set(key, id);
        capturedRecords.set(id, { id, dealer_id: 'created-shop', revision: 1, status: 'draft', attributes: { stock_number: `PT-${id}` }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' });
      }
      if (loseCapture) { loseCapture = false; return send(503, { code: 'unavailable' }); }
      return send(201, { data: capturedRecords.get(captureIntents.get(key)) });
    }
    const records = [
      { id: 'concert', title: 'Concert Grand', status: 'available', featured: true },
      { id: 'baby', title: 'Baby Grand', status: 'draft', featured: false },
      { id: 'upright', title: 'Studio Upright', status: 'sold', featured: false },
      ...[...capturedRecords.values()].map(r => ({ id: r.id, title: r.attributes.title || r.attributes.stock_number, status: r.status, featured: !!r.attributes.featured })),
    ].filter(item => (url.searchParams.get('status') ? item.status === url.searchParams.get('status') : url.searchParams.get('includeInactive') === 'true' || item.status !== 'sold') && item.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()));
    const offset = Number(url.searchParams.get('cursor') || 0);
    return send(200, { data: records.slice(offset, offset + 1).map(item => capturedRecords.get(item.id) || ({ id: item.id, dealer_id: 'created-shop', revision: 1, status: item.status, attributes: { stock_number: item.id, title: item.title, featured: item.featured }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' })), meta: offset + 1 < records.length ? { nextCursor: String(offset + 1) } : {} });
  }
  if (url.pathname === '/v1/dealers' && req.method === 'POST') {
    createRequests++;
    const key = req.headers['idempotency-key'];
    if (!creations.has(key)) { const shop = { ...body, id: 'created-shop', revision: 1 }; creations.set(key, { raw, shop }); shops.set(shop.id, shop); }
    assert.equal(creations.get(key).raw, raw);
    if (createRequests === 1) return send(503, { code: 'unavailable' });
    return send(201, { data: creations.get(key).shop });
  }
  if (url.pathname.includes('/staff-invitations/external-invite/')) {
    if (body.token !== joinToken || invitationAccepted) return send(400, { code: 'invalid_invitation' });
    if (url.pathname.endsWith('/preview')) return send(200, { data: { id: 'external-invite', dealerID: 'invited-shop', dealerName: 'Invited Pianos', role: 'viewer', expiresAt: '2030-01-01T00:00:00Z' } });
    invitationAccepted = true;
    shops.set('invited-shop', { ...shops.get('studio'), id: 'invited-shop', name: 'Invited Pianos' });
    return send(200, { data: { dealerID: 'invited-shop', userID: 'test-owner', active: true, grantPending: true } });
  }
  if (url.pathname === '/v1/dealers/invited-shop' && invitationAccepted && ++accessChecks === 1) return send(404, { code: 'not_found' });
  if (url.pathname.includes('/staff') && denyStaff) return send(404, { code: 'not_found' });
  if (url.pathname.includes('/staff-invitations')) {
    if (req.method === 'GET') return send(200, { data: [...staffInvitations.values()], meta: {} });
    if (url.pathname.endsWith('/revoke')) { const id = url.pathname.split('/').at(-2); staffInvitations.get(id).revokedAt = new Date().toISOString(); res.writeHead(204).end(); return; }
    const issued = { id: 'staff-invitation', dealerID: 'created-shop', dealerName: 'My edited shop', role: body.role, expiresAt: '2030-01-01T00:00:00Z', token: 'one-time-test-secret' };
    const { token, ...summary } = issued; staffInvitations.set(issued.id, summary); return send(201, { data: issued });
  }
  if (url.pathname.includes('/staff')) {
    if (req.method === 'GET') return send(200, { data: [...members.values()], meta: {} });
    const id = url.pathname.split('/').at(-2); const member = members.get(id);
    if (staffConflict) { staffConflict = false; member.revision++; return send(409, { code: 'conflict' }); }
    if (body.expectedRevision !== member.revision) return send(409, { code: 'conflict' });
    member.revision++; if (url.pathname.endsWith('/revoke')) member.active = false; else { member.role = body.role; member.grantPending = true; }
    return send(200, { data: member });
  }
  if (req.method === 'PUT') {
    const shop = shops.get(url.pathname.split('/').at(-1));
    if (conflictOnce) { conflictOnce = false; shop.revision++; shop.name = 'Concurrent shop'; }
    if (body.expectedRevision !== shop.revision) return send(409, { code: 'conflict' });
    const updated = { ...body, id: shop.id, revision: shop.revision + 1 }; shops.set(shop.id, updated); return send(200, { data: updated });
  }
  if (url.pathname === '/v1/session/refresh') {
    if (refreshMode === 'failure') return send(503, { code: 'unavailable' });
    if (refreshMode === 'recover') { const token = `rotated-${++rotations}`; sessions.add(token); return send(200, { data: { token, expiresAt: new Date(Date.now() + (rotations + 2) * 3600000).toISOString() } }); }
    refreshRequested(); await heldRefresh; return send(200, { data: { token: 'late-replacement', expiresAt: new Date(Date.now() + 3600000).toISOString() } }); }
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
  await page.clock.install();
  await page.goto(webURL);
  await page.getByRole('heading', { name: 'Tus tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Actualizar tiendas', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  assert.equal(firstPageReads, 3);
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).click();
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('New shop');
  await page.getByLabel('Nombre de la dirección de la sala de exposición', { exact: true }).fill('new-shop');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('new@example.com');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-profile-form-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).last().click();
  await page.getByText('El resultado no está confirmado. Reintenta este envío antes de cambiar el formulario.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).isDisabled(), true);
  const untilRefresh = await page.evaluate(() => Date.parse(JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).expiresAt) - Date.now() - 5 * 60000);
  await page.clock.fastForward(untilRefresh + 1000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'New shop');
  refreshMode = 'recover';
  await page.clock.fastForward(30000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByRole('heading', { name: 'New shop', exact: true }).waitFor();
  assert.equal(creations.size, 1); assert.equal(createRequests, 2);
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('My edited shop');
  refreshMode = 'failure';
  const nextRefresh = await page.evaluate(() => Date.parse(JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).expiresAt) - Date.now() - 5 * 60000);
  await page.clock.fastForward(nextRefresh + 1000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'My edited shop');
  refreshMode = 'recover';
  await page.clock.fastForward(30000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar perfil actual', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'My edited shop');
  await page.getByRole('button', { name: 'Revisar perfil actual', exact: true }).click();
  await page.getByText('Concurrent shop', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Conservar mis cambios sobre este perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('heading', { name: 'My edited shop', exact: true }).waitFor();
  assert.equal(shops.get('created-shop').revision, 3);
  await page.getByRole('button', { name: 'Ver inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cargar más pianos', exact: true }).click();
  await page.getByRole('heading', { name: 'Baby Grand', exact: true }).waitFor();
  await page.getByLabel('Estado', { exact: true }).selectOption('sold');
  await page.getByRole('heading', { name: 'Studio Upright', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 0);
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('absent');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByText('Ningún piano coincide con estos filtros.', { exact: true }).waitFor();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('');
  await page.getByLabel('Estado', { exact: true }).selectOption('active');
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-inventory-narrow.png', fullPage: true });
  inventoryMode = 'outage';
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click();
  await page.getByText('No se pudo cargar el inventario. Inténtalo de nuevo.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 1);
  inventoryMode = 'normal';
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByText('No se pudo cargar el inventario. Inténtalo de nuevo.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Concert Grand', exact: true }).click();
  await page.getByLabel('Marca', { exact: true }).waitFor();
  await page.getByLabel('Marca', { exact: true }).fill('Yamaha');
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,34');
  await page.getByLabel('Año', { exact: true }).fill('1920');
  await page.getByLabel('Mes', { exact: true }).fill('2');
  await page.getByLabel('Día', { exact: true }).fill('29');
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.asking_price.minor_units, 1234);
  assert.deepEqual(editorRecord.attributes.manufactured, { year: 1920, month: 2, day: 29 });
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,');
  await page.getByText('Revisa los campos indicados. Lo escrito se conserva en este dispositivo.', { exact: true }).waitFor();
  const writesBeforeRecovery = editorWrites;
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Concert Grand', exact: true }).click();
  await page.getByText('Los cambios recuperados están listos para revisar. El guardado está en pausa hasta que continúes.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Precio de venta', { exact: true }).inputValue(), '12,');
  assert.equal(editorWrites, writesBeforeRecovery);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-editor-narrow.png', fullPage: true });
  editorMode = 'lose';
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,50');
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('No se pudo confirmar el último guardado. Comprueba su estado antes de continuar.', { exact: true }).waitFor();
  const afterLost = editorWrites;
  await page.getByRole('button', { name: 'Consultar versión actual', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorWrites, afterLost);
  assert.equal(editorRecord.attributes.asking_price.minor_units, 1250);
  editorRecord = { ...editorRecord, revision: editorRecord.revision + 1, attributes: { ...editorRecord.attributes, make: 'Other editor' } };
  await page.getByLabel('Marca', { exact: true }).fill('My choice');
  await page.getByText('Este piano cambió en otro lugar. Revisa ambas versiones antes de elegir.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Consultar versión actual', exact: true }).click();
  await page.getByText('Other editor', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Conservar mis cambios', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.make, 'My choice');
  const beforeStorageFailure = editorWrites;
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restoreRecoveryWrites = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new Error('controlled storage outage'); return original.apply(this, args); };
  });
  await page.getByLabel('Modelo', { exact: true }).fill('Protected retry');
  await page.getByText('No se pudieron proteger los cambios en este dispositivo. Reintenta antes de salir.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  assert.equal(await page.getByLabel('Modelo', { exact: true }).inputValue(), 'Protected retry');
  assert.equal(editorWrites, beforeStorageFailure);
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  await page.evaluate(() => { window.restoreRecoveryWrites(); delete window.restoreRecoveryWrites; });
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.model, 'Protected retry');
  await page.getByText('Datos internos', { exact: true }).click();
  await page.getByLabel('Número de inventario', { exact: true }).fill('');
  await page.getByText('Datos internos', { exact: true }).click();
  await page.getByRole('link', { name: 'Número de inventario: Revisa este valor.', exact: true }).click();
  assert.equal(await page.getByLabel('Número de inventario', { exact: true }).evaluate(element => element === document.activeElement), true);
  await page.getByLabel('Número de inventario', { exact: true }).fill('concert');
  await page.getByText('Guardado', { exact: true }).waitFor();
  editorMode = 'denied';
  await page.getByLabel('Marca', { exact: true }).fill('Denied change');
  await page.getByText('Ya no tienes acceso a este inventario.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Marca', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await page.getByText('Añade datos para iniciar un borrador privado. El número de inventario se asigna automáticamente.', { exact: true }).waitFor();
  assert.equal(captureCreates, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-new-narrow.png', fullPage: true });
  await page.getByLabel('Título visible', { exact: true }).fill('New capture');
  await page.getByText('No se pudo confirmar el último guardado. Comprueba su estado antes de continuar.', { exact: true }).waitFor();
  assert.equal(capturedRecords.size, 1);
  const secondTab = await context.newPage();secondTab.setDefaultTimeout(15000);
  await secondTab.goto(webURL);
  await secondTab.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  await secondTab.getByRole('button', { name: 'My edited shop', exact: true }).click();
  await secondTab.getByRole('button', { name: 'Ver inventario', exact: true }).click();
  await secondTab.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await secondTab.getByText('Ya hay un piano nuevo abierto en otra ventana. Continúa allí o ciérrala y vuelve a intentarlo.', { exact: true }).waitFor();
  assert.equal(await secondTab.getByLabel('Título visible', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await page.getByText('Los cambios recuperados están listos para revisar. El guardado está en pausa hasta que continúes.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Título visible', { exact: true }).inputValue(), 'New capture');
  assert.equal(captureCreates, 1);
  await page.getByLabel('Marca', { exact: true }).fill('Kawai');
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(captureCreates, 2);assert.equal(captureIntents.size, 1);
  assert.equal(capturedRecords.get('captured-1').attributes.make, 'Kawai');
  assert.equal(capturedRecords.get('captured-1').attributes.stock_number, 'PT-captured-1');
  await secondTab.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await secondTab.getByText('Añade datos para iniciar un borrador privado. El número de inventario se asigna automáticamente.', { exact: true }).waitFor();
  assert.equal(await secondTab.getByLabel('Título visible', { exact: true }).inputValue(), '');
  await secondTab.close();
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('New capture');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByRole('button', { name: 'New capture', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Marca', { exact: true }).inputValue(), 'Kawai');
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  inventoryMode = 'denied';
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click();
  await page.getByText('Ya no tienes acceso a este inventario.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver a la tienda', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Administrar personal', exact: true }).click();
  await page.getByText('test-owner', { exact: true }).waitFor();
  assert.equal(await page.locator('article').filter({ hasText: 'test-owner' }).getByRole('button').count(), 0);
  await page.getByRole('button', { name: 'Cambiar a lector', exact: true }).click();
  await page.getByText('El acceso cambió en otro lugar. Actualiza y revisa antes de hacer otro cambio.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar a lector', exact: true }).click();
  await page.getByText(/Actualización de acceso pendiente/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-staff-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Eliminar acceso', exact: true }).click();
  assert.equal(members.get('test-editor').active, true);
  await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await page.getByText(/Eliminado/).waitFor();
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click();
  const code = page.getByLabel('Código de invitación de un solo uso', { exact: true });
  await code.waitFor();
  assert.equal(JSON.parse(await code.inputValue()).token, 'one-time-test-secret');
  assert.ok(!page.url().includes('one-time-test-secret'));
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  assert.equal(JSON.parse(await code.inputValue()).token, 'one-time-test-secret');
  await page.getByRole('button', { name: 'Revocar invitación', exact: true }).click();
  assert.equal(staffInvitations.get('staff-invitation').revokedAt, undefined);
  await page.getByRole('button', { name: 'Confirmar revocación', exact: true }).click();
  await page.getByText(/Revocada/).waitFor();
  assert.equal(await code.count(), 0);
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click();
  await code.waitFor();
  denyStaff = true;
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  await page.getByText('La administración del personal no está disponible o no tienes permiso.', { exact: true }).waitFor();
  assert.equal(await code.count(), 0);
  assert.equal(await page.getByText('test-owner', { exact: true }).count(), 0);
  assert.equal(await page.getByText('test-editor', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al perfil', exact: true }).click();
  denyStaff = true;
  await page.getByRole('button', { name: 'Administrar personal', exact: true }).click();
  await page.getByText('La administración del personal no está disponible o no tienes permiso.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Crear invitación', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al perfil', exact: true }).click();
  denyStaff = false;
  await page.getByRole('button', { name: 'Unirse a una tienda', exact: true }).click();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill('invalid-private-code');
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByText('Este código no es válido, ha caducado o ya no está disponible. Pide una nueva invitación al propietario.', { exact: true }).waitFor();
  const privateCode = JSON.stringify({ dealerID: 'invited-shop', invitationID: 'external-invite', token: joinToken });
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByRole('heading', { name: 'Invited Pianos', exact: true }).waitFor();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode + ' ');
  assert.equal(await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-join-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
  await page.getByText('Invitación aceptada.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Pega tu código de invitación', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Comprobar acceso a la tienda', exact: true }).click();
  await page.getByText('El acceso aún no está disponible. Si acabas de aceptar, espera un momento y vuelve a comprobarlo.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Comprobar acceso a la tienda', exact: true }).click();
  await page.getByRole('button', { name: 'Administrar personal', exact: true }).waitFor();
  assert.equal(accessChecks, 3);
  assert.ok(!page.url().includes(joinToken));
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert.ok(!storage.includes(joinToken));
  await page.getByRole('button', { name: 'Unirse a una tienda', exact: true }).click();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByText('Este código no es válido, ha caducado o ya no está disponible. Pide una nueva invitación al propietario.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();


  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
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
  refreshMode = 'hold';
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
  console.log('Lazy New capture/idempotent retry/recovery/cross-tab exclusion and inventory editing/autosave/partial-input recovery/lost-response reconciliation/conflict/denial, browsing/filter/search/pagination/retry/denial and dealer web invitation preview/acceptance/pending/replay, staff permissions/conflicts/removal/invitation revocation, creation retry, conflict review, form retention through session outages, Spanish pagination, keyboard selection, responsive layout and sign-out isolation passed');
} finally { releaseRefresh(); releaseDetail(); await browser.close(); server.close(); }
