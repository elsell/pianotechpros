import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const webURL='http://127.0.0.1:5194';
let profile=null,loseCreate=true,denied=false;const creations=new Map();let writes=0;let delaySave=false,releaseSave;let rotated=false;
const copy=v=>JSON.parse(JSON.stringify(v));
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',webURL);res.setHeader('Access-Control-Allow-Headers','authorization,content-type,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(!['Bearer technician-test-session','Bearer technician-rotated-session'].includes(req.headers.authorization))return send(401,{code:'unauthenticated'});
 const path=new URL(req.url,'http://fixture').pathname;
 if(path==='/v1/session/refresh'){rotated=true;return send(200,{data:{token:'technician-rotated-session',expiresAt:new Date(Date.now()+7200000).toISOString()}});}
 if(path==='/v1/me')return send(200,{data:{id:'technician-owner',email:'owner@example.test',displayName:'Owner'}});
 if(denied)return send(403,{code:'forbidden'});
 if(path==='/v1/technician-profile/timezones')return send(200,{data:{names:['America/Chicago','Europe/Madrid','UTC']}});
 if(path!=='/v1/technician-profile')return send(404,{code:'not_found'});
 if(req.method==='GET')return send(profile?200:404,profile?{data:copy(profile)}:{code:'not_found'});
 const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());
 if(req.method==='POST'){
  const key=req.headers['idempotency-key'];if(creations.has(key)){assert.deepEqual(body,creations.get(key));return send(201,{data:copy(profile)});}
  if(profile)return send(409,{code:'conflict'});creations.set(key,copy(body));writes++;
  profile={id:'technician-profile',revision:1,attributes:body.attributes,createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'};
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
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5194','--strictPort'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5194',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${api.address().port}`},stdio:['ignore','pipe','pipe'],detached:true});
for(const stream of [web.stdout,web.stderr])stream.on('data',data=>{log=(log+data).slice(-16000);});
let browser;
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{if((await fetch(webURL)).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 await context.addInitScript(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'technician-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.install();await page.goto(webURL+'/technician');
 const button=name=>page.getByRole('button',{name,exact:true});
 const field=(name)=>page.getByLabel(name,{exact:false});
 await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id==='name');assert.equal(writes,0);
 await field('Name (Required)').fill('Technician');await field('Email (Required)').fill('tech@example.test');await button('Back to profile').click();
 await button('Service area').click();await field('Location label').fill('Workshop');await field('Street address').fill('1 Main');await field('City (Required)').fill('Austin');await field('State or region').fill('Texas');await field('Postal code').fill('78701');await field('Service radius').fill('25');await field('Time zone (Required)').selectOption('America/Chicago');await button('Back to profile').click();
 await button('Work preferences').click();await field('Include my profile').check();await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id==='services');assert.equal(writes,0);await field('Tuning').check();await field('Grand').check();await field('Include my profile').check();await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id==='availability');assert.equal(writes,0);
 await button('Add a weekday').click();await field('Start time').fill('09:');await button('Save profile').click();await page.waitForFunction(()=>document.activeElement?.id.endsWith('.start'));assert.equal(writes,0);
 await page.reload();await page.getByText('Your protected draft has been restored.',{exact:true}).waitFor();await button('Weekly availability').click();await page.getByRole('button',{name:/Monday/}).click();assert.equal(await field('Start time').inputValue(),'09:');await field('Start time').fill('09:00');await button('Save profile').click();await page.getByText('The last save could not be confirmed. Retry that save first; newer edits stay in your draft.',{exact:true}).waitFor();assert.equal(writes,1);
 await field('End time').fill('18:');await page.reload();await button('Retry last save').click();await button('Save profile').waitFor();assert.equal(profile.attributes.availability[0].end,'17:00');assert.equal(writes,1);
 await button('Weekly availability').click();await page.getByRole('button',{name:/Monday/}).click();assert.equal(await field('End time').inputValue(),'18:');await field('End time').fill('18:00');await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.availability[0].end,'18:00');
 // Rule clocks stay independent when the service origin changes.
 await button('Back to profile').click();await button('Back to profile').click();await button('Service area').click();await field('Time zone (Required)').selectOption('UTC');await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.availability[0].timezone,'America/Chicago');
 await button('Back to profile').click();await button('Contact details').click();await field('Name (Required)').fill('Local');profile={...profile,revision:profile.revision+1,attributes:{...profile.attributes,name:'Remote'}};await button('Save profile').click();await button('Review latest version').click();await page.getByText('Remote',{exact:true}).waitFor();await button('Keep my edits').click();await button('Save profile').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.name,'Local');
 const other=await context.newPage();await other.goto(webURL+'/technician');await other.getByText('This profile is open in another editor. Close that editor, then try again.',{exact:true}).waitFor();await other.close();
 await button('Back to profile').click();await button('Weekly availability').click();await page.getByRole('button',{name:/Monday/}).click();await button('Remove').click();await page.getByRole('dialog').getByText('Remove the rule for Monday? You can add it again.',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(profile.attributes.availability.length,1);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/piano-technician-web.png',fullPage:true});
 delaySave=true;await field('End time').fill('18:30');await button('Save profile').click();
 for(let i=0;i<100&&!releaseSave;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releaseSave);
 await page.clock.fastForward(3301000);await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).token==='technician-rotated-session');assert.equal(rotated,true);releaseSave();
 await page.getByText('The last save could not be confirmed. Retry that save first; newer edits stay in your draft.',{exact:true}).waitFor();assert.equal(await field('End time').inputValue(),'18:30');
 await button('Retry last save').click();await page.getByText('Your profile is up to date.',{exact:true}).waitFor();assert.equal(profile.attributes.availability[0].end,'18:30');
 denied=true;await field('End time').fill('19:00');await button('Save profile').click();await page.getByText('Your profile is no longer available in this session.',{exact:true}).waitFor();assert.equal(await field('End time').count(),0);
 await page.waitForFunction(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pianotechpros-inventory-recovery',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').count();r.onsuccess=()=>resolve(r.result===0);r.onerror=()=>reject(r.error);});}finally{db.close();}});
 await button('Save draft and close').click();await page.waitForURL(webURL+'/');
 denied=false;const spanish=await browser.newContext({locale:'es-ES'});await spanish.addInitScript(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'technician-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 const es=await spanish.newPage();await es.goto(webURL+'/technician');const eb=name=>es.getByRole('button',{name,exact:true});
 await eb('Preferencias de trabajo').click();await es.getByLabel('Aceptar solicitudes sin disponibilidad semanal',{exact:true}).check();await eb('Volver al perfil').click();await eb('Disponibilidad semanal').click();await es.getByRole('button',{name:/lunes/}).click();await eb('Eliminar').click();await es.getByRole('dialog').getByText('¿Eliminar la regla del lunes? Puedes volver a añadirla.',{exact:true}).waitFor();await es.getByRole('dialog').getByRole('button',{name:'Eliminar',exact:true}).click();await eb('Guardar perfil').click();await es.getByText('Tu perfil está actualizado.',{exact:true}).waitFor();assert.equal(profile.attributes.availability.length,0);assert.equal(profile.attributes.acceptsRequestsWithoutAvailability,true);await spanish.close();
 console.log('Technician browser creation, partial weekly recovery, exact retry, origin/rule independence, conflict review, removal cancellation, competing tab, responsive layout and denial cleanup passed');
}finally{if(browser)await browser.close();try{process.kill(-web.pid,'SIGTERM');}catch{}await new Promise(resolve=>api.close(resolve));}
