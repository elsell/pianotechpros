import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {verifyPhotoManagement} from './persisted-photo-management.mjs';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const dealerName=process.env.INQUIRY_ACCEPTANCE_DEALER_NAME;
const local=value=>{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password;};
assert.ok(local(base)&&dealerName,'provide isolated synthetic fixture');
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
 await verifyPhotoManagement({page,context,recordURL,authorization,buffer});assert.equal(creates,1);
 console.log(JSON.stringify({result:'PASS',recordID,checks:['real processed uploads','persisted cover and earlier/later order','persisted photo description','keyboard preview restores focus','cancelled removal retains both photos','confirmed removal denies old image']}));
}finally{await browser.close();}
