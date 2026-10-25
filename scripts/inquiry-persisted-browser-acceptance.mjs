import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const slug=process.env.INQUIRY_ACCEPTANCE_SHOWROOM_SLUG;
const pianoID=process.env.INQUIRY_ACCEPTANCE_PIANO_ID;
const dealerName=process.env.INQUIRY_ACCEPTANCE_DEALER_NAME;
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'acceptance must use an isolated local service');
assert.ok(slug&&pianoID&&dealerName,'provide the synthetic published dealer/piano fixture');
const name='Acceptance buyer '+Date.now();
const browser=await chromium.launch({headless:true});let owner,buyer;
try{
 const buyerContext=await browser.newContext();buyer=await buyerContext.newPage();await buyer.goto(`${base}/showrooms/${slug}/pianos/${pianoID}`);await buyer.getByLabel('Your name',{exact:true}).fill(name);await buyer.getByLabel('Email address',{exact:true}).fill('buyer@example.com');await buyer.getByLabel('Your message',{exact:true}).fill('Synthetic inquiry: please arrange a Saturday visit.');
 const submitted=buyer.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/inquiries'));await buyer.getByRole('button',{name:'Send inquiry',exact:true}).click();assert.equal((await submitted).status(),204);await buyer.getByRole('heading',{name:'Your inquiry has been received by the dealer.',exact:true}).waitFor();assert.equal(await buyer.locator('#inquiry-email').count(),0);
 const ownerContext=await browser.newContext();owner=await ownerContext.newPage();await owner.goto(base);await owner.getByRole('button',{name:'Sign in',exact:true}).click();await owner.locator('input[name=login]').fill('developer@example.com');await owner.locator('input[name=password]').fill('password');await owner.getByRole('button',{name:'Login',exact:true}).click();await owner.getByRole('button',{name:dealerName,exact:true}).click();await owner.getByRole('button',{name:'Buyer inquiries',exact:true}).click();await owner.getByRole('button',{name:new RegExp(name)}).click();await owner.getByText('Synthetic inquiry: please arrange a Saturday visit.',{exact:true}).waitFor();
 const marked=owner.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/read'));await owner.getByRole('button',{name:'Mark as read',exact:true}).click();const response=await marked;assert.equal(response.status(),200);const body=await response.json();assert.equal(body.data.revision,2);const readAt=body.data.readAt;
 await owner.reload();await owner.getByRole('button',{name:dealerName,exact:true}).click();await owner.getByRole('button',{name:'Buyer inquiries',exact:true}).click();const detail=owner.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/'+body.data.id));await owner.getByRole('button',{name:new RegExp(name)}).click();const reread=await(await detail).json();assert.equal(reread.data.readAt,readAt);assert.equal(reread.data.revision,2);await owner.getByText(/First read /).waitFor();await owner.screenshot({path:'/tmp/piano-inquiry-persisted-owner.png',fullPage:true});
 console.log(JSON.stringify({result:'PASS',inquiryID:body.data.id,dealerID:body.data.piano.dealer_id,pianoID,readAt,buyer:name,checks:['anonymous browser 204','actual Dex PKCE login','persisted inbox detail','atomic mark-read','read receipt survives reload']}));
}catch(error){if(owner)console.error('OWNER:',await owner.locator('body').innerText());if(buyer)console.error('BUYER:',await buyer.locator('body').innerText());throw error;}finally{await browser.close();}
