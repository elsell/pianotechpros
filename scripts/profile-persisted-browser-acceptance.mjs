import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.PROFILE_ACCEPTANCE_WEB_URL??'http://localhost:5173';
const local=value=>{const url=new URL(value);return url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password;};
assert.ok(local(base),'Use an isolated loopback web server');
const browser=await chromium.launch({headless:true});
let evidencePage;
try{
 async function login(email){
  const context=await browser.newContext({locale:'en-US'});const page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto(base);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('input[name=login]').waitFor();assert.ok(local(page.url()),'Synthetic credentials require loopback identity provider');
  await page.locator('input[name=login]').fill(email);await page.locator('input[name=password]').fill('password');
  const me=page.waitForResponse(r=>new URL(r.url()).pathname==='/v1/me'&&r.request().method()==='GET');
  await page.getByRole('button',{name:'Login',exact:true}).click();const response=await me;assert.equal(response.status(),200);
  const api=new URL(response.url()).origin;assert.ok(local(api));const authorization=(await response.request().allHeaders()).authorization;assert.ok(authorization?.startsWith('Bearer '));
  return {context,page,api,authorization};
 }
 const actor=await login('second@example.com');const {page}=actor;evidencePage=page;
 const button=name=>page.getByRole('button',{name,exact:true});
 const field=name=>page.getByLabel(name,{exact:name.endsWith('(Required)')});
 const read=async(domain,session=actor)=>session.context.request.get(`${session.api}/v1/${domain}-profile`,{headers:{authorization:session.authorization}});
 for(const domain of ['customer','technician'])assert.equal((await read(domain)).status(),404,'Requires a fresh synthetic account; never overwrite existing profile');
 async function save(domain,status){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname===`/v1/${domain}-profile`&&['POST','PUT'].includes(r.request().method()));
  await button('Save profile').click();assert.equal((await pending).status(),status);await page.getByText('Your profile is up to date.',{exact:true}).waitFor();
  const response=await read(domain);assert.equal(response.status(),200);return (await response.json()).data;
 }
 await page.goto(base+'/customer');await field('Name (Required)').fill('Persisted Customer');await field('Email (Required)').fill('customer@example.test');
 await field('Business profile').check();await field('Business name (Required)').fill('Synthetic Piano Studio');
 for(const [label,address,zone] of [['Home','1 Test Street','America/Chicago'],['Studio','2 Test Street','America/New_York']]){
  await button('Add location').click();await field('Location name').fill(label);await field('Street address').fill(address);await field('City (Required)').fill('Boston');await field('State or region').fill('MA');await field('Postal code').fill('02110');
  await field('Timezone (Required)').selectOption(zone);await button('Back to profile').click();
 }
 await button('Add piano').click();await field('Piano name').fill('Studio Grand');await field('Piano type').selectOption('grand');await field('Year made').fill('1998');
 await field('Location (Required)').selectOption({label:'Studio'});
 let customer=await save('customer',201);assert.equal(customer.revision,1);assert.equal(customer.attributes.isBusiness,true);assert.equal(customer.attributes.businessName,'Synthetic Piano Studio');
 assert.equal(customer.attributes.locations.length,2);assert.equal(customer.attributes.pianos.length,1);
 const piano=customer.attributes.pianos[0];assert.equal(piano.nickname,'Studio Grand');assert.equal(piano.manufacturedYear,1998);assert.equal(piano.form,'grand');assert.equal(piano.locationKey,customer.attributes.locations[1].key);
 await page.reload();await field('Name (Required)').fill('Persisted Customer Updated');customer=await save('customer',200);assert.equal(customer.revision,2);assert.equal(customer.attributes.name,'Persisted Customer Updated');assert.equal(customer.attributes.pianos[0].key,piano.key);
 await page.goto(base+'/technician');await button('Contact details').click();await field('Name (Required)').fill('Persisted Technician');await field('Email (Required)').fill('technician@example.test');await button('Back to profile').click();
 await button('Service area').click();await field('Location label').fill('Workshop');await field('Street address').fill('3 Test Street');await field('City (Required)').fill('Boston');await field('State or region').fill('MA');await field('Postal code').fill('02110');await field('Service radius').fill('25');await field('Time zone (Required)').selectOption('America/Chicago');await button('Back to profile').click();
 await button('Work preferences').click();await field('Tuning').check();await field('Grand').check();await button('Back to profile').click();
 await button('Weekly availability').click();await button('Add a weekday').click();await field('Time zone (Required)').selectOption('America/New_York');await field('Start time').fill('09:00');await field('End time').fill('17:00');await field('First effective date').fill('2026-01-01');await field('Last effective date').fill('2027-12-31');
 let technician=await save('technician',201);assert.equal(technician.revision,1);assert.equal(technician.attributes.origin.timezone,'America/Chicago');assert.deepEqual(technician.attributes.services,['tuning']);assert.deepEqual(technician.attributes.forms,['grand']);assert.equal(technician.attributes.availability.length,1);
 const rule=technician.attributes.availability[0];assert.equal(rule.timezone,'America/New_York');assert.equal(rule.start,'09:00');assert.equal(rule.end,'17:00');assert.equal(rule.effectiveStart,'2026-01-01');assert.equal(rule.effectiveEnd,'2027-12-31');
 await page.reload();await button('Contact details').click();await field('Name (Required)').fill('Persisted Technician Updated');technician=await save('technician',200);assert.equal(technician.revision,2);assert.equal(technician.attributes.name,'Persisted Technician Updated');assert.deepEqual(technician.attributes.availability,[rule]);
 const other=await login('developer@example.com');
 for(const [domain,profile] of [['customer',customer],['technician',technician]]){
  const response=await read(domain,other);assert.ok([200,404].includes(response.status()));if(response.status()===200)assert.notEqual((await response.json()).data.id,profile.id);
 }
 console.log('Real-service web profile acceptance passed: normal PKCE, business, two locations, linked piano, weekly timezone/effective dates, persisted reload/edit, separate-user isolation');
}catch(error){if(evidencePage){await evidencePage.screenshot({path:'/tmp/piano-profile-persisted-failure.png',fullPage:true});console.error((await evidencePage.locator('body').innerText()).slice(0,6000));}throw error;}finally{await browser.close();}
