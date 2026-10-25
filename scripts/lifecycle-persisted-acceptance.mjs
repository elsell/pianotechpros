import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const dealerName=process.env.INQUIRY_ACCEPTANCE_DEALER_NAME;
const slug=process.env.INQUIRY_ACCEPTANCE_SHOWROOM_SLUG;
const local=value=>{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password;};
assert.ok(local(base)&&dealerName&&slug,'provide isolated synthetic fixture');
const browser=await chromium.launch({headless:true});let page;
try{
 const context=await browser.newContext();page=await context.newPage();
 page.on('response',r=>{if(r.status()>=400)console.error(JSON.stringify({status:r.status(),path:new URL(r.url()).pathname}));});
 await page.goto(base);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('input[name=login]').waitFor();assert.ok(local(page.url()));
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByRole('button',{name:dealerName,exact:true}).click();await page.getByRole('button',{name:'Browse inventory',exact:true}).click();
 let creates=0;page.on('request',r=>{if(r.method()==='POST'&&/\/inventory$/.test(new URL(r.url()).pathname))creates++;});
 await page.getByRole('button',{name:'New piano',exact:true}).click();await page.getByText('Add a photo or details to start a private draft. A stock number is assigned automatically.',{exact:true}).waitFor();assert.equal(creates,0);
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;const ctx=c.getContext('2d');ctx.fillStyle='#805b35';ctx.fillRect(0,0,80,60);return c.toDataURL('image/png').split(',')[1];}),'base64');
 const uploaded=page.waitForResponse(r=>r.request().method()==='POST'&&/\/photos$/.test(new URL(r.url()).pathname));
 await page.getByLabel('Choose a photo',{exact:true}).setInputFiles({name:'synthetic-piano.png',mimeType:'image/png',buffer});
 const upload=await uploaded;assert.equal(upload.status(),201);const photoData=(await upload.json()).data;const recordID=photoData.record.id;assert.equal(creates,1);
 await page.getByRole('button',{name:'Preview photo 1',exact:true}).waitFor();
 const api=new URL(upload.url()).origin;assert.ok(local(api));const authorization=(await upload.request().allHeaders()).authorization;assert.ok(authorization);
 const recordURL=`${api}/v1/dealers/${photoData.record.dealer_id}/inventory/${recordID}`;
 const publicURL=`${api}/v1/showrooms/${slug}/pianos/${recordID}`;
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(publicURL)).status(),404);
 const title='Photo-first acceptance '+Date.now();
 await page.getByLabel('Display title',{exact:true}).fill(title);await page.getByLabel('Make',{exact:true}).fill('Yamaha');await page.getByLabel('Piano type',{exact:true}).selectOption('grand');await page.getByLabel('Condition',{exact:true}).selectOption('used');await page.getByLabel('Year',{exact:true}).fill('1998');await page.getByLabel('Asking price',{exact:true}).fill('1234.56');await page.getByLabel('Price currency',{exact:true}).selectOption('USD');await page.getByLabel('Show asking price',{exact:true}).check();
 await page.getByRole('button',{name:'Save now',exact:true}).click();await page.getByText('Saved',{exact:true}).waitFor();
 const confirm=async(button,path)=>{
  await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(path));
  await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();const result=await response;assert.equal(result.status(),200);await dialog.waitFor({state:'hidden'});return(await result.json()).data;
 };
 const published=await confirm('Review publication','/publish');assert.equal(published.record.status,'available');let snapshot=published.publication.snapshot;
 const publicState=async(status)=>{const response=await anonymous.request.get(publicURL);if(status===null){assert.equal(response.status(),404);return;}assert.equal(response.status(),200);assert.deepEqual((await response.json()).data.piano,{...snapshot,status});};
 await publicState('available');
 const unpublished=await confirm('Review unpublishing','/unpublish');assert.equal(unpublished.record.status,'available');await publicState(null);const republished=await confirm('Review publication','/publish');assert.ok(republished.publication.snapshot.publication_revision>snapshot.publication_revision);assert.deepEqual(republished.publication.snapshot,{...snapshot,publication_revision:republished.record.revision});snapshot=republished.publication.snapshot;await publicState('available');
 await page.getByLabel('Display title',{exact:true}).fill(title+' PRIVATE EDIT');await page.getByRole('button',{name:'Save now',exact:true}).click();await page.getByText('Saved',{exact:true}).waitFor();
 await page.locator('summary').filter({hasText:'New availability'}).click();
 const transition=async(status,reason='',price=null)=>{
  await page.getByLabel('New availability',{exact:true}).selectOption(status);await page.getByLabel('Correction reason',{exact:true}).fill(reason);
  if(status==='sold'){assert.equal(await page.getByLabel('Final sale amount',{exact:true}).inputValue(),'1234.56');if(price!==null)await page.getByLabel('Final sale amount',{exact:true}).fill(price);}
  const state=await confirm('Review availability change','/lifecycle');assert.equal(state.record.status,status);assert.equal(state.record.attributes.title,title+' PRIVATE EDIT');return state;
 };
 await transition('reserved');await publicState('reserved');
 await transition('sold','','1100.25');await publicState('sold');
 const history=async()=>{const response=await context.request.get(recordURL+'/history',{headers:{authorization}});assert.equal(response.status(),200);return(await response.json()).data;};
 const soldHistory=await history();const sale=soldHistory.find(event=>event.kind==='lifecycle'&&event.to==='sold');assert.ok(sale);assert.deepEqual(sale.sale_price,{minor_units:110025,currency:'USD'});
 await transition('available','Synthetic sale correction');await publicState('available');const corrected=await history();assert.deepEqual(corrected.find(event=>event.revision===sale.revision),sale);assert.ok(corrected.some(event=>event.kind==='lifecycle'&&event.from==='sold'&&event.to==='available'&&event.reason==='Synthetic sale correction'));
 // The complete journey includes two publications and nine reviewed transitions.
 // Start a fresh audit window before the hidden-state half without changing limits.
 console.log('Waiting for a fresh audit window before hidden lifecycle states');
 await new Promise(resolve=>setTimeout(resolve,61000));
 await transition('in_service');await publicState(null);
 await transition('available');await publicState(null);
 await transition('draft','Synthetic return to draft');await publicState(null);
 await transition('available');await publicState(null);
 await transition('archived');await publicState(null);
 await transition('available','Synthetic archive correction');await publicState(null);
 const finalHistory=await history();assert.deepEqual(finalHistory.find(event=>event.revision===sale.revision),sale);
 await page.getByRole('button',{name:'View history',exact:true}).click();await page.locator('section.history').getByText('Synthetic sale correction',{exact:true}).waitFor();
 console.log(JSON.stringify({result:'PASS',recordID,checks:['photo-first draft','publication makes available','unpublish preserves availability','reserved and sold preserve snapshot despite private edits','sale amount defaults and explicit override','sale correction appends history','in-service/draft/archive hide public access','return to available does not republish','sale evidence remains immutable','browser displays persisted history']}));
}finally{await browser.close();}
