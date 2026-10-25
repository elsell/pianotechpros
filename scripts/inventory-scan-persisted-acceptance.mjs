import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {navigatePrivateScan} from './private-scan-navigation.mjs';
const base=process.env.SCAN_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const dealerName=process.env.SCAN_ACCEPTANCE_DEALER_NAME;
const existingTitle=process.env.SCAN_ACCEPTANCE_EXISTING_TITLE;
const local=url=>['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
assert.ok(local(base)&&dealerName&&existingTitle,'provide isolated local synthetic fixture');
const browser=await chromium.launch({headless:true});
async function login(page){
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('input[name=login]').waitFor();
 assert.ok(local(page.url()),'test credentials require local identity provider');
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
}
try{
 const setup=await browser.newContext();const page=await setup.newPage();await page.goto(base);await login(page);
 await page.getByRole('button',{name:dealerName,exact:true}).click();await page.getByRole('button',{name:'Browse inventory',exact:true}).click();
 const selected=page.waitForResponse(r=>r.request().method()==='GET'&&/\/inventory\/[^/]+$/.test(new URL(r.url()).pathname));
 await page.getByRole('button',{name:existingTitle,exact:true}).click();const response=await selected;assert.equal(response.status(),200);
 const current=(await response.json()).data;const api=new URL(response.url()).origin;assert.ok(local(api));const authorization=(await response.request().allHeaders()).authorization;assert.ok(authorization);
 const root=`${api}/v1/dealers/${encodeURIComponent(current.dealer_id)}/inventory`;
 const created=await setup.request.post(root,{headers:{authorization,'Idempotency-Key':randomUUID()}});assert.equal(created.status(),201);let record=(await created.json()).data;
 const title=`Scan acceptance ${Date.now()}`;
 const updated=await setup.request.put(`${root}/${record.id}`,{headers:{authorization},data:{expectedRevision:record.revision,attributes:{...record.attributes,title,make:'Yamaha',model:'C3'}}});assert.equal(updated.status(),200);record=(await updated.json()).data;
 const ensure=()=>setup.request.post(`${root}/${record.id}/scan-label`,{headers:{authorization}});
 const labelResponse=await ensure();assert.equal(labelResponse.status(),200);const label=(await labelResponse.json()).data;
 const repeated=await ensure();assert.equal(repeated.status(),200);const repeatLabel=(await repeated.json()).data;assert.ok(repeatLabel.token===label.token&&repeatLabel.dealer_id===label.dealer_id&&repeatLabel.record_id===label.record_id,'persisted label association must remain stable');
 const link=`${base}/scan#v=1&dealer=${encodeURIComponent(label.dealer_id)}&token=${encodeURIComponent(label.token)}`;
 const context=await browser.newContext();const scan=await context.newPage();let resolves=0,fragmentAtAPI=false,tokenInRequestURL=false;
 scan.on('request',request=>{if(request.url().includes(label.token))tokenInRequestURL=true;if(new URL(request.url()).origin===api&&new URL(scan.url()).hash)fragmentAtAPI=true;if(new URL(request.url()).pathname.endsWith('/scan/resolve'))resolves++;});
 await navigatePrivateScan(scan,link);await scan.getByRole('button',{name:'Sign in',exact:true}).waitFor();assert.ok(new URL(scan.url()).hash==='','scan fragment must be consumed');assert.equal(resolves,0);await login(scan);
 await scan.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(new URL(scan.url()).pathname,'/scan');assert.ok(new URL(scan.url()).hash==='','scan fragment must be consumed');assert.equal(resolves,1);assert.equal(fragmentAtAPI,false);assert.equal(tokenInRequestURL,false);
 assert.ok(await scan.evaluate(()=>sessionStorage.getItem('pianotechpros_scan_continuation')===null),'scan continuation must be consumed');
 const actions=scan.locator('section.scan-actions');const review=actions.getByRole('dialog');
 await actions.locator('select').first().selectOption('available');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();await review.getByRole('button',{name:'Confirm change',exact:true}).click();await scan.getByText('Change confirmed.',{exact:true}).waitFor();
 const read=async()=>{const result=await setup.request.get(`${root}/${record.id}`,{headers:{authorization}});assert.equal(result.status(),200);return(await result.json()).data;};
 let saved=await read();assert.equal(saved.status,'available');assert.equal(saved.revision,record.revision+1);
 await actions.locator('select').first().selectOption('sold');await actions.locator('input[inputmode=decimal]').fill('1234.50');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();await review.getByRole('button',{name:'Confirm change',exact:true}).click();await scan.getByText('Change confirmed.',{exact:true}).waitFor();
 saved=await read();assert.equal(saved.status,'sold');assert.equal(saved.revision,record.revision+2);
 const historyResponse=await setup.request.get(`${root}/${record.id}/history`,{headers:{authorization}});assert.equal(historyResponse.status(),200);const history=(await historyResponse.json()).data;assert.equal(history[0].to,'sold');assert.deepEqual(history[0].sale_price,{minor_units:123450,currency:'USD'});
 await scan.getByRole('button',{name:'Refresh piano',exact:true}).click();await actions.getByText('Sold · Not published yet',{exact:true}).waitFor();
 await scan.getByRole('button',{name:'Sign out',exact:true}).click();await scan.waitForURL(base+'/');assert.ok(await scan.evaluate(()=>sessionStorage.getItem('pianotechpros_scan_continuation')===null),'scan continuation must be consumed');
 console.log(JSON.stringify({result:'PASS',dealerID:record.dealer_id,pianoID:record.id,title,revision:saved.revision,checks:['stable persisted label','real provider scan continuation','token absent from request URLs','single-use continuation','persisted available and sold transitions','fresh scanned status','sign-out clears continuation']}));
}finally{await browser.close();}
