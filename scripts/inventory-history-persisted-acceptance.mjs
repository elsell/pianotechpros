import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.HISTORY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const dealerName=process.env.HISTORY_ACCEPTANCE_DEALER_NAME;
const existingTitle=process.env.HISTORY_ACCEPTANCE_EXISTING_TITLE;
const local=url=>['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
assert.ok(local(base)&&dealerName&&existingTitle,'provide isolated local synthetic fixture');
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:900,height:1100}});const page=await context.newPage();
 await page.goto(base);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 assert.ok(local(page.url()),'test credentials require local identity provider');
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByRole('button',{name:dealerName,exact:true}).click();await page.getByRole('button',{name:'Browse inventory',exact:true}).click();
 const selected=page.waitForResponse(response=>response.request().method()==='GET'&&/\/inventory\/[^/]+$/.test(new URL(response.url()).pathname));
 await page.getByRole('button',{name:existingTitle,exact:true}).click();const response=await selected;assert.equal(response.status(),200);
 const current=(await response.json()).data;const api=new URL(response.url()).origin;assert.ok(local(api));const authorization=(await response.request().allHeaders()).authorization;assert.ok(authorization);
 const root=`${api}/v1/dealers/${encodeURIComponent(current.dealer_id)}/inventory`;
 const created=await context.request.post(root,{headers:{authorization,'Idempotency-Key':randomUUID()}});assert.equal(created.status(),201);let record=(await created.json()).data;
 const title=`History acceptance ${Date.now()}`;
 for(let i=0;i<24;i++){
  const attributes={...record.attributes,title,make:i%2?'Yamaha':'Steinway',private_notes:'PRIVATE HISTORY SENTINEL'};
  const updated=await context.request.put(`${root}/${record.id}`,{headers:{authorization},data:{expectedRevision:record.revision,attributes,voiceFields:i===20?['make']:[]}});
  assert.equal(updated.status(),200);record=(await updated.json()).data;
 }
 await page.getByRole('button',{name:'Back to inventory',exact:true}).click();await page.getByRole('button',{name:'Refresh inventory',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();
 const year=page.locator('#year');await year.waitFor();const original=await year.inputValue();await year.fill('19x');
 const first=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/history'));
 await page.getByRole('button',{name:'View history',exact:true}).click();const firstResponse=await first;assert.equal(firstResponse.status(),200);const firstBody=await firstResponse.json();assert.equal(firstBody.data.length,20);assert.equal(firstBody.data[0].revision,25);assert.ok(firstBody.meta.nextCursor);assert.ok(!JSON.stringify(firstBody).includes('PRIVATE HISTORY SENTINEL'));
 const panel=page.locator('section.history');await panel.getByText('Make — Voice suggestion',{exact:true}).waitFor();await panel.getByRole('heading',{name:'History',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/piano-history-persisted-web.png'});
 const older=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/history'));
 await panel.getByRole('button',{name:'Older changes',exact:true}).click();const last=await(await older).json();assert.equal(last.data.length,5);assert.equal(last.data.at(-1).revision,1);assert.equal(last.meta.nextCursor,undefined);await panel.getByText('Draft created',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Close history',exact:true}).click();assert.equal(await year.inputValue(),'19x');await year.fill(original);
 console.log(JSON.stringify({result:'PASS',dealerID:current.dealer_id,pianoID:record.id,title,revision:record.revision,checks:['actual Dex session','actual API creates 25 synthetic revisions','persisted voice origin','20+5 bounded pages','private snapshot value absent','unsaved invalid editor value preserved']}));
}finally{await browser.close();}
