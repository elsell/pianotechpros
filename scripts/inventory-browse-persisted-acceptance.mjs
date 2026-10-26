import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const dealerName=process.env.INQUIRY_ACCEPTANCE_DEALER_NAME;
const local=value=>{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password;};
assert.ok(local(base)&&dealerName,'provide isolated synthetic fixture');
const browser=await chromium.launch();
try{
 const context=await browser.newContext();const page=await context.newPage();await page.goto(base);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('input[name=login]').waitFor();assert.ok(local(page.url()));
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByRole('button',{name:dealerName,exact:true}).click();
 const list=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/inventory'));
 await page.getByRole('button',{name:'Browse inventory',exact:true}).click();const initial=await list;assert.equal(initial.status(),200);
 const root=initial.url().split('?')[0];assert.ok(local(root));const authorization=(await initial.request().allHeaders()).authorization;assert.ok(authorization);
 const marker='Browse'+randomUUID().slice(0,8),records=[];
 for(let i=0;i<31;i++){
  const created=await context.request.post(root,{headers:{authorization,'Idempotency-Key':randomUUID()}});assert.equal(created.status(),201);const record=(await created.json()).data;
  const attributes={...record.attributes,title:marker+(i===0?'-solo':'-row-'+i),...(i===0?{stock_number:marker+'stock',make:marker+'make',model:marker+'model',featured:true}:{} )};
  const saved=await context.request.put(root+'/'+record.id,{headers:{authorization},data:{expectedRevision:record.revision,attributes}});assert.equal(saved.status(),200);records.push((await saved.json()).data);
 }
 const rows=page.locator('button.item');
 const search=async value=>{
  await page.getByLabel('Search stock, title, make or model',{exact:true}).fill(value);
  const ready=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().startsWith(root+'?')&&new URL(r.url()).searchParams.get('search')===value);
  await page.getByRole('button',{name:'Search inventory',exact:true}).click();assert.equal((await ready).status(),200);await page.locator('ul[aria-busy="false"]').waitFor();
 };
 for(const field of ['stock_number','title','make','model']){await search(records[0].attributes[field]);assert.deepEqual(await rows.allTextContents(),[records[0].attributes.title]);}
 await search(marker);assert.equal(await rows.count(),30);assert.equal(await rows.first().innerText(),records[0].attributes.title);
 const more=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().startsWith(root+'?')&&new URL(r.url()).searchParams.has('cursor'));
 await page.getByRole('button',{name:'Load more pianos',exact:true}).click();assert.equal((await more).status(),200);await page.locator('ul[aria-busy="false"]').waitFor();
 assert.deepEqual((await rows.allTextContents()).sort(),records.map(r=>r.attributes.title).sort());assert.equal(await page.getByRole('button',{name:'Load more pianos',exact:true}).count(),0);
 const sold=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().startsWith(root+'?')&&new URL(r.url()).searchParams.get('status')==='sold');await page.getByLabel('Status',{exact:true}).selectOption('sold');assert.equal((await sold).status(),200);await page.getByText('No pianos match these filters.',{exact:true}).waitFor();assert.equal(await rows.count(),0);
 console.log(JSON.stringify({result:'PASS',marker,count:31,checks:['normal PKCE','real persisted stock/title/make/model search','featured record first','30+1 cursor pagination with exact set and no duplicates','sold filter excludes draft records']}));
}finally{await browser.close();}
