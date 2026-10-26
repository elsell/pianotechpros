import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const slug=process.env.INQUIRY_ACCEPTANCE_SHOWROOM_SLUG;
const dealerName=process.env.INQUIRY_ACCEPTANCE_DEALER_NAME;
const local=value=>{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password;};
assert.ok(local(base)&&dealerName&&slug,'provide isolated synthetic fixture');
const browser=await chromium.launch();
try{
 const context=await browser.newContext();const page=await context.newPage();await page.goto(base);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('input[name=login]').waitFor();assert.ok(local(page.url()));
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByRole('button',{name:dealerName,exact:true}).click();
 const list=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/inventory'));
 await page.getByRole('button',{name:'Browse inventory',exact:true}).click();const initial=await list;assert.equal(initial.status(),200);
 const root=initial.url().split('?')[0];assert.ok(local(root));const authorization=(await initial.request().allHeaders()).authorization;assert.ok(authorization);
 const marker='Catalog'+randomUUID().slice(0,8),records=[];
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];}),'base64');
 const data=async(response,status=200)=>{assert.equal(response.status(),status);return(await response.json()).data;};
 for(let i=0;i<31;i++){
  if(i&&i%10===0){console.log('Waiting for a fresh audit window during catalog provisioning');await new Promise(resolve=>setTimeout(resolve,61000));}
  const created=await data(await context.request.post(root,{headers:{authorization,'Idempotency-Key':randomUUID()}}),201);
  const url=root+'/'+created.id;
  const saved=await data(await context.request.put(url,{headers:{authorization},data:{expectedRevision:created.revision,attributes:{...created.attributes,title:marker+'-'+i,form:'grand',condition:'used',featured:i===0,asking_price:{minor_units:123456,currency:'USD'},price_visible:true}}}));
  const uploaded=await data(await context.request.post(url+'/photos?expectedRevision='+saved.revision,{headers:{authorization,'Idempotency-Key':randomUUID(),'Content-Type':'application/octet-stream'},data:buffer}),201);
  await data(await context.request.post(url+'/publish',{headers:{authorization},data:{expectedRevision:uploaded.record.revision}}));
  records.push({id:created.id,title:marker+'-'+i});
 }
 for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
 if(engine!=='chromium'){console.log('Waiting for a fresh public rate window before '+engine);await new Promise(resolve=>setTimeout(resolve,61000));}
 const publicBrowser=await type.launch();
 try{
 const anonymous=await publicBrowser.newContext();const buyer=await anonymous.newPage();
 const query=new URLSearchParams({search:marker,form:'grand',currency:'USD'});
 await buyer.goto(`${base}/showrooms/${slug}?${query}`);
 const cards=buyer.locator('.grid article a');await buyer.locator('.grid h2').first().waitFor();assert.equal(await cards.count(),12);
 assert.equal(await buyer.locator('.grid h2').first().innerText(),records[0].title);
 const ids=()=>cards.evaluateAll(links=>links.map(link=>link.getAttribute('href').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)?.[1]??null));
 const seen=await ids();let finalPage=[];
 for(const expectedCount of [12,7]){
  const next=buyer.getByRole('link',{name:'See more pianos',exact:false});const href=await next.getAttribute('href');assert.ok(href);
  const continuation=new URL(href,base);assert.ok(continuation.searchParams.get('cursor'));
  for(const [key,value] of query)assert.equal(continuation.searchParams.get(key),value);
  await Promise.all([buyer.waitForURL(continuation.href),next.click()]);await buyer.locator('.grid h2').first().waitFor();
  finalPage=await ids();assert.equal(finalPage.length,expectedCount);seen.push(...finalPage);
 }
 assert.deepEqual(seen.sort(),records.map(r=>r.id).sort());
 assert.equal(await buyer.getByRole('link',{name:'See more pianos',exact:false}).count(),0);
 await buyer.reload();await buyer.locator('.grid h2').first().waitFor();assert.deepEqual(await ids(),finalPage);
 console.log(JSON.stringify({result:'PASS',marker,engine,version:publicBrowser.version(),checks:['31 real published records with processed photos','featured first','anonymous 12+12+7 exact-set pagination','continuation retains search/type/currency','final page reload stable','no duplicates or extra continuation']}));
 }finally{await publicBrowser.close();}
 }
}finally{await browser.close();}
