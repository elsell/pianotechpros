import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.INQUIRY_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const occupiedSlug=process.env.INQUIRY_ACCEPTANCE_SHOWROOM_SLUG;
const local=value=>{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password;};
assert.ok(local(base)&&occupiedSlug,'provide isolated synthetic dealer fixture');
for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
 if(engine!=='chromium'){console.log('Waiting for a fresh audit window before '+engine);await new Promise(resolve=>setTimeout(resolve,61000));}
 const browser=await type.launch({headless:true});let page;
try{
 const context=await browser.newContext();page=await context.newPage();
 await page.goto(base);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('input[name=login]').waitFor();assert.ok(local(page.url()));
 await page.locator('input[name=login]').fill('developer@example.com');await page.locator('input[name=password]').fill('password');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByRole('button',{name:'Create shop',exact:true}).click();
 const name='Browser settings '+Date.now();const slug='browser-'+randomUUID();
 const values={name,slug:occupiedSlug,email:'synthetic@example.com',phone:'+1 202 555 0100',website_url:'https://example.com',tagline:'Synthetic piano showroom',description:'Synthetic showroom description',street_address_1:'123 Test Street',street_address_2:'Suite 2',city:'Boston',region:'MA',postal_code:'02110',banner_alt_text:'Synthetic showroom banner',appointment_note:'Visits by appointment',delivery_note:'Synthetic delivery terms',warranty_note:'Synthetic warranty terms',service_note:'Synthetic service terms',accent_color:'#245b43'};
 const labels={name:'Shop name',slug:'Showroom address name',email:'Email',phone:'Phone',website_url:'Website',tagline:'Short introduction',description:'About the shop',street_address_1:'Street address',street_address_2:'Apartment, suite or unit',city:'City',region:'State or region',postal_code:'Postal code',banner_alt_text:'Banner description',appointment_note:'Appointments',delivery_note:'Delivery',warranty_note:'Warranty',service_note:'Service',accent_color:'Accent color'};
 for(const [key,label] of Object.entries(labels))await page.getByLabel(label,{exact:true}).fill(values[key]);
 const [duplicate]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/dealers'),page.getByRole('button',{name:'Create shop',exact:true}).last().click()]);assert.equal(duplicate.status(),409);
 await page.getByText('That showroom address name is already in use. Choose another.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Shop name',{exact:true}).inputValue(),name);
 await page.getByLabel('Showroom address name',{exact:true}).fill(slug);values.slug=slug;
 const [created]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/dealers'),page.getByRole('button',{name:'Create shop',exact:true}).last().click()]);assert.equal(created.status(),201);const dealer=(await created.json()).data;
 const api=new URL(created.url()).origin;assert.ok(local(api));const authorization=(await created.request().allHeaders()).authorization;assert.ok(authorization);const path=api+'/v1/dealers/'+dealer.id;
 const read=async()=>{const response=await context.request.get(path,{headers:{authorization}});assert.equal(response.status(),200);return(await response.json()).data;};
 const initial=await read();for(const [key,value] of Object.entries(values))assert.equal(initial[key],value,key);
 const anonymous=await browser.newContext();const showroom=api+'/v1/showrooms/'+slug;assert.equal((await anonymous.request.get(showroom)).status(),404);
 await page.reload();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'Edit profile',exact:true}).click();
 for(const [key,label] of Object.entries(labels))assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),values[key],key);
 await page.getByLabel('Enable public showroom',{exact:true}).check();await page.getByLabel('Short introduction',{exact:true}).fill('Updated synthetic introduction');values.tagline='Updated synthetic introduction';
 const [saved]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===path),page.getByRole('button',{name:'Save changes',exact:true}).click()]);assert.equal(saved.status(),200);const persisted=await read();assert.equal(persisted.showroom_published,true);assert.equal(persisted.tagline,values.tagline);
 const publicResult=await anonymous.request.get(showroom);assert.equal(publicResult.status(),200);const publicProfile=(await publicResult.json()).data;assert.deepEqual(publicProfile,{id:dealer.id,banner:null,...values});
 const buyer=await anonymous.newPage();await buyer.goto(base+'/showrooms/'+slug);await buyer.getByRole('heading',{name,exact:true}).waitFor();await buyer.getByRole('heading',{name:values.tagline,exact:true}).waitFor();
 await page.getByRole('button',{name:'Showroom banner',exact:true}).click();
 const uploadBanner=async(color)=>{
  const bytes=Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=800;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,800,300);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  await page.getByLabel('Choose banner image',{exact:true}).setInputFiles({name:'synthetic-banner.png',mimeType:'image/png',buffer:bytes});await page.getByRole('dialog').waitFor();
  const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/banner')),page.getByRole('button',{name:'Use this banner',exact:true}).click()]);assert.equal(response.status(),201);await page.getByRole('dialog').waitFor({state:'hidden'});return(await response.json()).data.banner.id;
 };
 const firstBanner=await uploadBanner('#245b43');
 const publicBanner=id=>showroom+'/banner/'+id;
 const firstImage=await anonymous.request.get(publicBanner(firstBanner));assert.equal(firstImage.status(),200);assert.equal(firstImage.headers()['content-type'],'image/jpeg');
 await buyer.reload();await buyer.getByRole('img',{name:values.banner_alt_text,exact:true}).waitFor();await buyer.waitForFunction(alt=>[...document.images].some(img=>img.alt===alt&&img.naturalWidth>0),values.banner_alt_text);
 const secondBanner=await uploadBanner('#805b35');assert.notEqual(secondBanner,firstBanner);assert.equal((await anonymous.request.get(publicBanner(firstBanner))).status(),404);assert.equal((await anonymous.request.get(publicBanner(secondBanner))).status(),200);
 await page.getByRole('button',{name:'Remove banner',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await anonymous.request.get(publicBanner(secondBanner))).status(),200);
 await page.getByRole('button',{name:'Remove banner',exact:true}).click();const [removed]=await Promise.all([page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.endsWith('/banner')),page.getByRole('button',{name:'Remove banner now',exact:true}).click()]);assert.equal(removed.status(),200);assert.equal((await anonymous.request.get(publicBanner(secondBanner))).status(),404);assert.equal((await read()).banner_alt_text,values.banner_alt_text);
 await buyer.reload();assert.equal(await buyer.getByRole('img',{name:values.banner_alt_text,exact:true}).count(),0);await page.getByRole('button',{name:'Back to shop',exact:true}).click();
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();await page.getByLabel('Enable public showroom',{exact:true}).uncheck();const [hidden]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===path),page.getByRole('button',{name:'Save changes',exact:true}).click()]);assert.equal(hidden.status(),200);assert.equal((await anonymous.request.get(showroom)).status(),404);
 console.log(JSON.stringify({result:'PASS',engine,version:browser.version(),dealerID:dealer.id,checks:['duplicate slug retains form','all settings persisted','reload and edit','explicit showroom visibility','public projection excludes ownership metadata','explicit hide','real banner upload/render/replace/cancel/remove']}));
}catch(error){if(page)console.error(await page.locator('body').innerText());throw error;}finally{await browser.close();}
}
