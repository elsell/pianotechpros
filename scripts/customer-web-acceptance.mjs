import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const webURL='http://127.0.0.1:5193';
let profile=null,loseCreate=true,denied=false;const creations=new Map();let writes=0;let delaySave=false,releaseSave;let rotated=false;
const copy=v=>JSON.parse(JSON.stringify(v));
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',webURL);res.setHeader('Access-Control-Allow-Headers','authorization,content-type,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(!['Bearer customer-test-session','Bearer customer-rotated-session'].includes(req.headers.authorization))return send(401,{code:'unauthenticated'});
 const path=new URL(req.url,'http://fixture').pathname;
 if(path==='/v1/session/refresh'){rotated=true;return send(200,{data:{token:'customer-rotated-session',expiresAt:new Date(Date.now()+7200000).toISOString()}});}
 if(path==='/v1/me')return send(200,{data:{id:'customer-owner',email:'owner@example.test',displayName:'Owner'}});
 if(denied)return send(403,{code:'forbidden'});
 if(path==='/v1/customer-profile/timezones')return send(200,{data:{names:['America/Chicago','Europe/Madrid','UTC']}});
 if(path!=='/v1/customer-profile')return send(404,{code:'not_found'});
 if(req.method==='GET')return send(profile?200:404,profile?{data:copy(profile)}:{code:'not_found'});
 const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());
 if(req.method==='POST'){
  const key=req.headers['idempotency-key'];if(creations.has(key)){assert.deepEqual(body,creations.get(key));return send(201,{data:copy(profile)});}
  if(profile)return send(409,{code:'conflict'});creations.set(key,copy(body));writes++;
  profile={id:'customer-profile',revision:1,attributes:body.attributes,createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'};
  if(loseCreate){loseCreate=false;return send(503,{code:'unavailable'});}return send(201,{data:copy(profile)});
 }
 if(req.method==='PUT'){
  if(delaySave){delaySave=false;await new Promise(resolve=>{releaseSave=resolve;});return send(401,{code:'unauthenticated'});}
  if(body.expectedRevision!==profile.revision)return send(409,{code:'conflict'});
  profile={...profile,revision:profile.revision+1,attributes:body.attributes};writes++;return send(200,{data:copy(profile)});
 }
 send(405,{code:'bad_request'});
});
api.listen(0,'127.0.0.1');await once(api,'listening');
const built=process.env.WEB_ACCEPTANCE_BUILT==='1';let log='';
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5193','--strictPort'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5193',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${api.address().port}`},stdio:['ignore','pipe','pipe'],detached:true});
for(const stream of [web.stdout,web.stderr])stream.on('data',data=>{log=(log+data).slice(-16000);});
let browser;
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{if((await fetch(webURL)).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 await context.addInitScript(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'customer-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.install();await page.goto(webURL+'/customer');
 const button=name=>page.getByRole('button',{name,exact:true});
 const field=(name)=>page.getByLabel(name,{exact:false});
 await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id==='name');assert.equal(writes,0);
 await field('Name (Required)').fill('Piano Owner');await field('Email (Required)').fill('owner@example.test');
 await button('Add location').click();
 await field('Location name').fill('Home');await field('Street address').fill('1 Main Street');await field('City (Required)').fill('Austin');await field('State or region').fill('Texas');await field('Postal code').fill('78701');
 await field('Search timezones').fill('Chicago');await field('Timezone (Required)').selectOption('America/Chicago');await button('Back to profile').click();
 await button('Add piano').click();await field('Piano name').fill('Living room grand');await field('Piano type').selectOption('grand');await field('Year made').fill('19');
 await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id.endsWith('.manufacturedYear'));assert.equal(writes,0);
 await field('Year made').fill('1998');await button('Back to profile').click();await button('Save profile').click();await page.getByText('The last save could not be confirmed. Retry that save first; newer edits stay in your draft.',{exact:true}).waitFor();assert.equal(writes,1);
 await field('Name (Required)').fill('Later edit');await page.reload();await page.getByText('Your protected draft has been restored.',{exact:true}).waitFor();assert.equal(await field('Name (Required)').inputValue(),'Later edit');
 await button('Retry last save').click();await button('Save profile').waitFor();assert.equal(profile.attributes.name,'Piano Owner');assert.equal(writes,1);
 await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.name,'Later edit');assert.equal(writes,2);
 // A second tab cannot overwrite the journal while this workspace owns it.
 const other=await context.newPage();await other.goto(webURL+'/customer');await other.getByText('This profile is open in another editor. Close that editor, then try again.',{exact:true}).waitFor();await other.close();
 await field('Name (Required)').fill('Local edit');profile={...profile,revision:profile.revision+1,attributes:{...profile.attributes,name:'Server edit'}};
 await button('Save profile').click();await button('Review latest version').click();await page.getByText('Server edit',{exact:true}).waitFor();await button('Keep my edits').click();assert.equal(profile.attributes.name,'Server edit');await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.name,'Local edit');
 await button('Living room grand Home').click();await button('Remove').click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(profile.attributes.pianos.length,1);
 await button('Remove').click();await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.pianos.length,0);
 // A late rejection of an old credential must preserve the pending command.
 delaySave=true;await field('Name (Required)').fill('Rotate-safe draft');await button('Save profile').click();
 for(let i=0;i<100&&!releaseSave;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releaseSave);
 await page.clock.fastForward(3301000);await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).token==='customer-rotated-session');assert.equal(rotated,true);releaseSave();
 await page.getByText('The last save could not be confirmed. Retry that save first; newer edits stay in your draft.',{exact:true}).waitFor();assert.equal(await field('Name (Required)').inputValue(),'Rotate-safe draft');
 await button('Retry last save').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.name,'Rotate-safe draft');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/piano-customer-web.png',fullPage:true});
 denied=true;await field('Name (Required)').fill('Denied edit');await button('Save profile').click();await page.getByText('Your profile is no longer available in this session.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Name (Required)').count(),0);assert.equal(profile.attributes.name,'Rotate-safe draft');
 await page.waitForFunction(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pianotechpros-inventory-recovery',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').count();r.onsuccess=()=>resolve(r.result===0);r.onerror=()=>reject(r.error);});}finally{db.close();}});
 denied=false;
 const spanish=await browser.newContext({locale:'es-ES'});await spanish.addInitScript(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'customer-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 const es=await spanish.newPage();es.on('pageerror',error=>console.error('Spanish page error:',error.message));await es.goto(webURL+'/customer');await es.getByLabel('Perfil de empresa',{exact:true}).check();await es.getByLabel('Nombre de la empresa (Obligatorio)',{exact:true}).fill('Taller de pianos');await es.getByRole('button',{name:'Guardar perfil',exact:true}).click();await es.getByText('Tu perfil está actualizado.',{exact:true}).waitFor();assert.equal(profile.attributes.businessName,'Taller de pianos');
 await es.getByLabel('Nombre (Obligatorio)',{exact:true}).fill('Borrador local');await es.getByText('Cambios protegidos en este dispositivo. Guarda para actualizar el perfil.',{exact:true}).waitFor();
 await es.getByRole('button',{name:'Guardar borrador y cerrar',exact:true}).click();await es.waitForURL(webURL+'/');try{await es.getByRole('link',{name:'Mi perfil de cliente',exact:true}).click();}catch(error){console.error(await es.locator('body').innerText());console.error(log);throw error;}await es.getByText('Se ha recuperado tu borrador protegido.',{exact:true}).waitFor();assert.equal(await es.getByLabel('Nombre (Obligatorio)',{exact:true}).inputValue(),'Borrador local');
 await es.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await es.waitForFunction(()=>sessionStorage.getItem('pianotechpros_application_session')===null);await es.reload();await es.getByRole('button',{name:'Guardar perfil',exact:true}).waitFor();assert.equal(await es.getByLabel('Nombre (Obligatorio)',{exact:true}).inputValue(),'Rotate-safe draft');
 await spanish.close();
 console.log('Customer browser create/recovery/exact retry, validation focus, conflict, removal, two-tab ownership, session rotation, responsive layout, denial cleanup, Spanish navigation and logout passed');
}finally{if(browser)await browser.close();try{process.kill(-web.pid,'SIGTERM');}catch{}await new Promise(resolve=>api.close(resolve));}
