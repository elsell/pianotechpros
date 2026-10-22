import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealerDirectory, type DealerDirectoryPort } from './dealer-directory.js';

type Shop = { id: string; name: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Directory implements DealerDirectoryPort<Shop> {
  pages = new Map<string, { items: Shop[]; nextCursor?: string }>();
  shops = new Map<string, Shop>();
  calls: string[] = [];
  pendingPage: ReturnType<typeof deferred<{ items: Shop[]; nextCursor?: string }>> | null = null;
  pendingDetail = new Map<string, ReturnType<typeof deferred<Shop>>>();
  async list(cursor = '') { this.calls.push(cursor); if (this.pendingPage) return this.pendingPage.promise; const page = this.pages.get(cursor); if (!page) throw 'unavailable'; return page; }
  async get(id: string) { const pending = this.pendingDetail.get(id); if (pending) return pending.promise; const shop = this.shops.get(id); if (!shop) throw 'not_found'; return shop; }
}
const shop = (id: string): Shop => ({ id, name: id });
const classify = (error: unknown) => error === 'not_found' ? 'not_found' : 'unavailable';

test('directory handles empty authorized pages, deduplicates rows and preserves pages on failure', async () => {
  const port = new Directory();
  port.pages.set('', { items: [], nextCursor: 'one' });
  port.pages.set('one', { items: [shop('a')], nextCursor: 'two' });
  port.pages.set('two', { items: [shop('a'), shop('b')] });
  const directory = createDealerDirectory<Shop, string>(classify);
  directory.replaceSession('alice', port);
  await directory.refresh();
  assert.equal(directory.snapshot().nextCursor, 'one');
  await directory.loadMore();
  assert.deepEqual(directory.snapshot().items, [shop('a')]);
  port.pendingPage = deferred();
  const first = directory.loadMore(); const second = directory.loadMore();
  port.pendingPage.reject('unavailable'); await Promise.all([first, second]);
  assert.equal(port.calls.filter((c) => c === 'two').length, 1);
  assert.deepEqual(directory.snapshot().items, [shop('a')]);
  assert.equal(directory.snapshot().nextCursor, 'two');
  port.pendingPage = null;
  await directory.loadMore();
  assert.deepEqual(directory.snapshot().items, [shop('a'), shop('b')]);
  assert.equal(directory.snapshot().listFailure, null);
});

test('session replacement and clear discard late list responses and old failures', async () => {
  const port = new Directory(); port.pendingPage = deferred();
  const directory = createDealerDirectory<Shop, string>(classify);
  directory.replaceSession('alice', port);
  const first = directory.refresh();
  directory.replaceSession('alice', new Directory());
  port.pendingPage.resolve({ items: [shop('private')] }); await first;
  assert.deepEqual(directory.snapshot().items, []);
  port.pendingPage = deferred(); directory.replaceSession('bob', port);
  const second = directory.refresh(); directory.clear();
  port.pendingPage.reject('unavailable'); await second;
  assert.equal(directory.snapshot().accountId, null);
  assert.equal(directory.snapshot().listFailure, null);
});

test('superseded selections cannot reveal stale profiles or errors', async () => {
  const port = new Directory(); port.pendingDetail.set('a', deferred()); port.shops.set('b', shop('b'));
  const directory = createDealerDirectory<Shop, string>(classify);
  directory.replaceSession('alice', port);
  const first = directory.select('a'); await directory.select('b');
  port.pendingDetail.get('a')!.resolve(shop('a')); await first;
  assert.equal(directory.snapshot().selected?.id, 'b');
  await directory.select('missing');
  assert.equal(directory.snapshot().selected, null);
  assert.equal(directory.snapshot().detailFailure, 'not_found');
  directory.clear(); assert.equal(directory.snapshot().selectedId, null);
});

test('refresh supersedes in-flight pagination and notifies subscribers with cleared account state', async () => {
  const port = new Directory(); port.pages.set('', { items: [shop('a')], nextCursor: 'next' });
  const directory = createDealerDirectory<Shop, string>(classify);
  const accounts: (string | null)[] = [];
  const unsubscribe = directory.subscribe((state) => accounts.push(state.accountId));
  directory.replaceSession('alice', port); await directory.refresh();
  port.pendingPage = deferred(); const pending = port.pendingPage;
  const oldPage = directory.loadMore(); port.pendingPage = null;
  port.pages.set('', { items: [shop('fresh')] }); await directory.refresh();
  pending.resolve({ items: [shop('stale')] }); await oldPage;
  assert.deepEqual(directory.snapshot().items, [shop('fresh')]);
  directory.clear(); assert.equal(directory.snapshot().nextCursor, undefined); unsubscribe();
  assert.equal(accounts.at(-1), null);
  assert.throws(() => directory.replaceSession('', port));
});


test('account replacement clears previously loaded pagination', async () => {
  const port = new Directory(); port.pages.set('', { items: [shop('private')], nextCursor: 'private-cursor' });
  const directory = createDealerDirectory<Shop, string>(classify);
  directory.replaceSession('alice', port); await directory.refresh();
  directory.replaceSession('bob', new Directory());
  assert.equal(directory.snapshot().nextCursor, undefined);
  assert.deepEqual(directory.snapshot().items, []);
});
