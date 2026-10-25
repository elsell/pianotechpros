import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const webURL='http://127.0.0.1:5194';
const shop={id:'shop',name:'Rotation Workshop',slug:'rotation',email:'shop@example.test',revision:1,accent_color:'#245b43',showroom_published:false};
let record={id:'piano',dealer_id:'shop',revision:1,status:'available',attributes:{stock_number:'PT-1',title:'Rotating Piano'},created_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z'};
let rotations=0,mode='hold-edit',releaseEdit,releaseVoice;const edits=[];
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',webURL);res.setHeader('Access-Control-Allow-Headers','authorization,content-type,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(!/^Bearer rotation-session-[0-9]+$/.test(req.headers.authorization??''))return send(401,{code:'unauthenticated'});
 const path=new URL(req.url,'http://fixture').pathname;let text='';for await(const part of req)text+=part;const body=text?JSON.parse(text):{};
 if(path==='/v1/session/refresh'){rotations++;return send(200,{data:{token:'rotation-session-'+rotations,expiresAt:new Date(Date.now()+3600000*(rotations+1)).toISOString()}});}
 if(path==='/v1/me')return send(200,{data:{id:'rotation-owner',email:'owner@example.test',displayName:'Owner'}});
 if(path==='/v1/dealers')return send(200,{data:[shop],meta:{}});
 if(path==='/v1/dealers/shop')return send(200,{data:shop});
 if(path==='/v1/dealers/shop/inventory')return send(200,{data:[record],meta:{}});
 if(path.endsWith('/photos'))return send(200,{data:{record,photos:[]}});
 if(path.endsWith('/publication'))return send(200,{data:{record,publication:null}});
 if(path.endsWith('/voice/extract')){
  if(mode==='hold-voice'){mode='normal';await new Promise(resolve=>{releaseVoice=resolve;});return send(401,{code:'unauthenticated'});}
  return send(200,{data:{revision:record.revision,transcript:body.transcript,candidates:[{field:'make',value:{text:'Steinway'},confidence:'high',evidence:'Steinway'}]}});
 }
 if(path==='/v1/dealers/shop/inventory/piano'){
  if(req.method==='PUT'){
   edits.push(JSON.parse(JSON.stringify(body)));
   if(mode==='hold-edit'){mode='normal';await new Promise(resolve=>{releaseEdit=resolve;});return send(401,{code:'unauthenticated'});}
   if(mode==='deny-current')return send(401,{code:'unauthenticated'});
   if(body.expectedRevision!==record.revision)return send(409,{code:'conflict'});
   record={...record,revision:record.revision+1,attributes:body.attributes};
  }
  return send(200,{data:record});
 }
 send(404,{code:'not_found'});
});
api.listen(0,'127.0.0.1');await once(api,'listening');
const web=spawn(process.execPath,['apps/web/build/index.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5194',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${api.address().port}`},stdio:['ignore','pipe','pipe'],detached:true});
let log='',browser;for(const stream of [web.stdout,web.stderr])stream.on('data',data=>{log=(log+data).slice(-12000);});
const observed=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('request_not_observed');};
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{if((await fetch(webURL)).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.addInitScript(()=>{if(!sessionStorage.getItem('pianotechpros_application_session'))sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'rotation-session-0',expiresAt:new Date(Date.now()+3600000).toISOString()}));});
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));await page.goto(webURL);
 const button=name=>page.getByRole('button',{name,exact:true});
 const rotate=async number=>{const delay=await page.evaluate(()=>Date.parse(JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).expiresAt)-Date.now()-300000+1000);assert.ok(delay>0);const ready=page.waitForResponse(response=>response.url().endsWith('/v1/me')&&response.request().headers().authorization==='Bearer rotation-session-'+number);await page.clock.fastForward(delay);await ready;await page.waitForFunction(token=>JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).token===token,'rotation-session-'+number);};
 const open=async()=>{await button('Rotation Workshop').click();await button('Browse inventory').click();await button(record.attributes.title).click();await page.getByLabel('Display title',{exact:true}).waitFor();};
 await open();await page.getByLabel('Display title',{exact:true}).fill('First edit');for(let step=0;step<100&&!releaseEdit;step++){await page.clock.runFor(100);await new Promise(resolve=>setTimeout(resolve,30));}await observed(()=>!!releaseEdit);
 await page.getByLabel('Display title',{exact:true}).fill('Newer draft');await rotate(1);releaseEdit();
 await page.getByText('The last save could not be confirmed. Check its status before continuing.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Display title',{exact:true}).inputValue(),'Newer draft');
 await page.reload();await open();await page.getByText('Recovered changes are ready to review. Saving is paused until you continue.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Display title',{exact:true}).inputValue(),'Newer draft');
 await button('Save now').click();await observed(()=>edits.length>=2);assert.deepEqual(edits[1],edits[0]);assert.equal(record.attributes.title,'First edit');
 await button('Save now').click();await page.getByText('Saved',{exact:true}).waitFor();assert.equal(record.attributes.title,'Newer draft');
 // Voice has immediate denial side effects in addition to shared classifiers.
 mode='hold-voice';await page.getByLabel('Transcript',{exact:true}).fill('Steinway grand');await button('Review suggestions').click();await observed(()=>!!releaseVoice);
 await rotate(2);releaseVoice();
 try{await button('Review suggestions').waitFor();}catch(error){console.error(await page.locator('body').innerText());throw error;}
 assert.equal(await page.getByLabel('Transcript',{exact:true}).inputValue(),'Steinway grand');await button('Review suggestions').click();await page.getByText('Steinway',{exact:true}).first().waitFor();await button('Cancel voice').click();
 // Current-credential rejection still invalidates the session and hides private UI.
 mode='deny-current';await page.getByLabel('Display title',{exact:true}).fill('Denied edit');await button('Save now').click();await page.waitForFunction(()=>sessionStorage.getItem('pianotechpros_application_session')===null);assert.equal(await page.getByLabel('Display title',{exact:true}).count(),0);
 console.log('Built inventory session rotation preserves pending command, newer draft and voice transcript; current-session rejection remains authoritative');
}finally{releaseEdit?.();releaseVoice?.();if(browser)await browser.close();try{process.kill(-web.pid,'SIGTERM');}catch{}api.closeAllConnections();await new Promise(resolve=>api.close(resolve));}
