import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createDealerApiClient, DealerClientError, type DealerProfileInput } from './dealer.js';

const profile: DealerProfileInput = { name: 'Shop', slug: 'shop', email: 'shop@example.com', accent_color: '#123456', showroom_published: false };

test('dealer facade preserves idempotency, CAS, opaque cursors and current credentials over HTTP', async (t) => {
  let currentToken = 'session-one';
  let revision = 1;
  const reservations = new Map<string, string>();
  const received: { method: string; path: string; token: string | undefined; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    received.push({ method: req.method!, path: req.url!, token: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== `Bearer ${currentToken}`) return send(401, { code: 'unauthenticated' });
    if (req.method === 'POST' && req.url === '/v1/dealers') {
      const key = String(req.headers['idempotency-key']);
      if (reservations.has(key) && reservations.get(key) !== raw) return send(409, { code: 'idempotency_conflict', detail: 'sensitive input' });
      reservations.set(key, raw);
      return send(201, { data: { ...body, id: 'shop-id', revision } });
    }
    if (req.method === 'PUT') {
      if (body.expectedRevision !== revision) return send(409, { code: 'conflict' });
      revision++;
      return send(200, { data: { ...profile, id: 'shop-id', revision } });
    }
    return send(200, { data: [], meta: { nextCursor: 'opaque+/=' } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const api = createDealerApiClient(`http://127.0.0.1:${address.port}`, () => currentToken);
  assert.equal((await api.create(profile, 'one-logical-operation')).id, 'shop-id');
  assert.equal((await api.create(profile, 'one-logical-operation')).id, 'shop-id');
  await assert.rejects(api.create({ ...profile, name: 'Changed' }, 'one-logical-operation'), (error: unknown) => error instanceof DealerClientError && error.code === 'idempotency_conflict' && !JSON.stringify(error).includes('sensitive'));
  assert.equal(reservations.size, 1);
  currentToken = 'session-two';
  assert.equal((await api.update('shop-id', profile, 1)).revision, 2);
  await assert.rejects(api.update('shop-id', profile, 1), (error: unknown) => error instanceof DealerClientError && error.code === 'conflict');
  const page = await api.list();
  assert.deepEqual(page, { items: [], nextCursor: 'opaque+/=' });
  await api.list(page.nextCursor);
  assert.equal(new URL(received.at(-1)!.path, 'http://localhost').searchParams.get('cursor'), 'opaque+/=');
  assert.equal(received.at(-1)!.token, 'Bearer session-two');
});

test('staff commands keep secret tokens out of URLs and preserve command revisions', async (t) => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    requests.push({ url: req.url!, body: raw ? JSON.parse(raw) : {} });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/revoke') && req.url.includes('staff-invitations')) { res.statusCode = 204; res.end(); return; }
    res.end(JSON.stringify(req.method === 'GET' ? { data: [], meta: { nextCursor: 'staff-cursor' } } : { data: { id: 'invitation' } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const api = createDealerApiClient(`http://127.0.0.1:${address.port}`, () => 'opaque-session');
  await api.previewInvitation('shop', 'invitation', 'secret-value');
  await api.acceptInvitation('shop', 'invitation', 'secret-value');
  await api.changeStaffRole('shop', 'member', 'viewer', 4);
  await api.removeStaff('shop', 'member', 5);
  await api.revokeInvitation('shop', 'invitation');
  assert.ok(requests.every((r) => !r.url.includes('secret-value')));
  assert.deepEqual(requests[0].body, { token: 'secret-value' });
  assert.deepEqual(requests[1].body, { token: 'secret-value' });
  assert.deepEqual(requests[2].body, { role: 'viewer', expectedRevision: 4 });
  assert.deepEqual(requests[3].body, { expectedRevision: 5 });
  await api.createInvitation('shop', 'editor', 48);
  assert.deepEqual(requests.at(-1)!.body, { role: 'editor', expiresInHours: 48 });
  assert.equal((await api.listStaff('shop')).nextCursor, 'staff-cursor');
  assert.equal((await api.listInvitations('shop', 'previous-cursor')).nextCursor, 'staff-cursor');
  assert.equal(new URL(requests.at(-1)!.url, 'http://localhost').searchParams.get('cursor'), 'previous-cursor');
});

for (const scenario of ['unknown-error', 'empty-success', 'invalid-json', 'network'] as const) {
  test(`dealer facade redacts ${scenario} failures`, async (t) => {
    const server = createServer((_req, res) => {
      if (scenario === 'network') { res.destroy(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = scenario === 'unknown-error' ? 500 : 200;
      res.end(scenario === 'invalid-json' ? 'secret-body' : JSON.stringify(scenario === 'unknown-error' ? { code: 'secret-body', detail: 'secret-body' } : {}));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const api = createDealerApiClient(`http://127.0.0.1:${address.port}`, () => 'session');
    await assert.rejects(api.get('shop'), (error: unknown) => error instanceof DealerClientError && ['protocol_error', 'network'].includes(error.code) && !JSON.stringify(error).includes('secret-body') && !error.message.includes('secret-body'));
  });
}


for (const [status, code] of [[401, 'unauthenticated'], [429, 'rate_limited'], [503, 'unavailable']] as const) {
  test(`dealer errors retain ${status} machine status without retaining raw details`, async (t) => {
    const server = createServer((_req, res) => {
      res.statusCode = status; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code, detail: 'secret-detail', errors: [{ value: 'secret-value' }] }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const api = createDealerApiClient(`http://127.0.0.1:${address.port}`, () => 'session');
    await assert.rejects(api.list(), (error: unknown) => error instanceof DealerClientError && error.status === status && error.code === code && !JSON.stringify(error).includes('secret'));
  });
}
