import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();
 const url=(process.env.DEALER_WEB_URL||'http://127.0.0.1:5173')+'/__customer_ownership__';
 await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Ownership acceptance</title>'}));
 const first=await context.newPage(),second=await context.newPage();
 await Promise.all([first.goto(url),second.goto(url)]);
 const acquire=page=>page.evaluate(async()=>{
  const {browserCustomerOwnership}=await import('/src/lib/customer/ownership.ts');
  globalThis.lease=await browserCustomerOwnership.acquire('customer-acceptance');
  return !!globalThis.lease;
 });
 assert.equal(await acquire(first),true);
 assert.equal(await acquire(second),false);
 assert.equal(await second.evaluate(async()=>{
  const {browserCustomerOwnership}=await import('/src/lib/customer/ownership.ts');
  const other=await browserCustomerOwnership.acquire('customer-other-account');
  await other.release();return !!other;
 }),true);
 await first.evaluate(()=>globalThis.lease.release());
 assert.equal(await acquire(second),true);
 // An old release is idempotent and cannot release the successor's lease.
 await first.evaluate(()=>globalThis.lease.release());
 assert.equal(await acquire(first),false);
 await second.close();
 let recovered=false;
 for(let attempt=0;attempt<100&&!recovered;attempt++){recovered=await acquire(first);if(!recovered)await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(recovered,true);
 await first.evaluate(()=>globalThis.lease.release());
 console.log('Customer Web Locks: two-tab exclusion, independent scopes, idempotent release and closed-tab recovery passed');
}finally{await browser.close();}
