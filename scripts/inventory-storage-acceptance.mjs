import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();const harness=(process.env.DEALER_WEB_URL||'http://127.0.0.1:5179')+'/__storage_acceptance__';
 await page.route(harness,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage acceptance</title>'}));
 await page.goto(harness);
 const result=await page.evaluate(async()=>{
  const {openBrowserInventoryRecovery,clearBrowserInventoryRecovery}=await import('/src/lib/inventory/recovery-storage.ts');
  await clearBrowserInventoryRecovery();
  const first=await openBrowserInventoryRecovery('user-one');const second=await openBrowserInventoryRecovery('user-two');
  await first.write('journal','PRIVATE-CHECKPOINT');
  if(await second.read('journal')!==null)throw Error('cross-account read');
  const same=await openBrowserInventoryRecovery('user-one');if(await same.read('journal')!=='PRIVATE-CHECKPOINT')throw Error('restart read');
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pianotechpros-inventory-recovery',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const rows=await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(JSON.stringify(rows).includes('PRIVATE-CHECKPOINT')||rows.length!==1)throw Error('plaintext persistence');
  const keys=await new Promise((resolve,reject)=>{const r=db.transaction('accounts').objectStore('accounts').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(keys.some(row=>row.key.extractable))throw Error('extractable key');
  await clearBrowserInventoryRecovery();let rejected=false;try{await first.write('journal','STALE');}catch{rejected=true;}if(!rejected)throw Error('stale write resurrected');
  const fresh=await openBrowserInventoryRecovery('user-one');if(await fresh.read('journal')!==null)throw Error('cleared draft restored');
  rejected=false;try{await same.write('journal','OLD-HANDLE');}catch{rejected=true;}if(!rejected)throw Error('new account generation revived old handle');
  await fresh.write('journal','TAMPER-TARGET');
  await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');const store=tx.objectStore('drafts');const r=store.get(['user-one','journal']);r.onsuccess=()=>{const row=r.result;new Uint8Array(row.ciphertext)[0]^=255;store.put(row);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
  rejected=false;try{await fresh.read('journal');}catch(error){rejected=String(error)==='Error: inventory_storage_unavailable';}if(!rejected)throw Error('tampered ciphertext accepted');
  db.close();await clearBrowserInventoryRecovery();
  const delayed=await openBrowserInventoryRecovery('delayed');
  const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);let release;let started;const ready=new Promise(resolve=>{started=resolve;});const gate=new Promise(resolve=>{release=resolve;});
  crypto.subtle.encrypt=async(...args)=>{const ciphertext=await encrypt(...args);started();await gate;return ciphertext;};
  try {const pending=delayed.write('journal','DELAYED');const rejected=pending.then(()=>false,()=>true);await ready;localStorage.setItem('pianotechpros_inventory_cleanup_pending','failed-cleanup');release();if(!await rejected)throw Error('delayed encryption bypassed cleanup');}
  finally {crypto.subtle.encrypt=encrypt;await clearBrowserInventoryRecovery();}
  const [parallelA,parallelB]=await Promise.all([openBrowserInventoryRecovery('parallel'),openBrowserInventoryRecovery('parallel')]);await parallelA.write('journal','PARALLEL');if(await parallelB.read('journal')!=='PARALLEL')throw Error('concurrent account key mismatch');
  const {revokeApplicationSession}=await import('/src/lib/auth.ts');sessionStorage.removeItem('pianotechpros_application_session');await revokeApplicationSession({});
  const afterSignOut=await openBrowserInventoryRecovery('parallel');if(await afterSignOut.read('journal')!==null)throw Error('sign-out retained draft');
  localStorage.setItem('pianotechpros_inventory_cleanup_pending','1');let closed=false;try{await afterSignOut.write('journal','PENDING-CLEANUP');}catch{closed=true;}if(!closed)throw Error('cleanup marker allowed write');
  const reopened=await openBrowserInventoryRecovery('parallel');if(localStorage.getItem('pianotechpros_inventory_cleanup_pending'))throw Error('pending cleanup not retried');await reopened.write('reload','RELOAD-PAYLOAD');
  const {openBrowserCustomerRecovery}=await import('/src/lib/customer/recovery-storage.ts');
  const customer=await openBrowserCustomerRecovery('parallel');
  const attributes={name:'Customer',isBusiness:false,businessName:'',email:'customer@example.test',phone:'',locations:[{key:'home',label:'Home',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC',notes:''}],pianos:Array.from({length:200},(_,i)=>({key:'p'+i,locationKey:'home',nickname:'Piano',form:'grand',make:'',model:'',serial:'',manufacturedYear:'',player:false,notes:'x'.repeat(2000)}))};
  const checkpoint=JSON.stringify({version:1,baseline:{id:'profile',revision:1,attributes},draft:attributes,pending:{kind:'save',id:'profile',revision:1,attributes},conflict:false});
  if(new TextEncoder().encode(checkpoint).length<=1024*1024)throw Error('large checkpoint fixture too small');
  await customer.write('large-customer',checkpoint);
  let oversized=false;try{await customer.write('too-large','😀'.repeat(1024*1024+1));}catch{oversized=true;}if(!oversized)throw Error('oversized customer checkpoint accepted');
  return {passed:true};
 });
 assert.equal(result.passed,true);
 await page.reload();
 assert.equal(await page.evaluate(async()=>{const storage=await import('/src/lib/inventory/recovery-storage.ts');const handle=await storage.openBrowserInventoryRecovery('parallel');const value=await handle.read('reload');const customer=JSON.parse(await handle.read('large-customer'));if(customer.draft.pianos.length!==200||customer.pending.attributes.pianos[199].notes!=='x'.repeat(2000))throw Error('large customer checkpoint lost on reload');await storage.clearBrowserInventoryRecovery();return value;}),'RELOAD-PAYLOAD');
 console.log('Browser inventory encryption, reload, scope, generation invalidation and tamper checks passed');
} finally {await browser.close();}
