import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const webURL='http://127.0.0.1:5192';
let profile={id:'shop',revision:1,name:'Banner Workshop',slug:'shop',email:'shop@example.com',accent_color:'#245346',showroom_published:true};
let banner=null,denied=false,loseUpload=true,loseRemoval=true,uploads=0,removals=0;
const intents=new Map(),image=readFileSync(new URL('./fixtures/showroom.jpg',import.meta.url));
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',webURL);res.setHeader('Access-Control-Allow-Headers','authorization,content-type,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(req.headers.authorization!=='Bearer banner-test-session')return send(401,{code:'unauthenticated'});
 const url=new URL(req.url,'http://fixture'),parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
 if(url.pathname==='/v1/me')return send(200,{data:{id:'owner',email:'owner@example.com',displayName:'Owner'}});
 if(url.pathname==='/v1/dealers')return send(200,{data:[profile],meta:{}});
 if(url.pathname==='/v1/dealers/shop')return send(200,{data:profile});
 if(url.pathname.startsWith('/v1/dealers/shop/banner')){
  if(denied)return send(404,{code:'not_found'});
  if(url.pathname.endsWith('/image')){if(!banner||!url.pathname.includes('/'+banner.id+'/'))return send(404,{code:'not_found'});res.setHeader('Content-Type','image/jpeg');res.end(image);return;}
  const data=()=>({profile:{...profile},banner:banner?{...banner}:null});
  if(req.method==='GET')return send(200,{data:data()});
  const revision=Number(url.searchParams.get('expectedRevision')),key=req.headers['idempotency-key'];
  if(req.method==='POST'&&intents.has(key)){const prior=intents.get(key);assert.deepEqual(bytes,prior.bytes);assert.equal(revision,prior.revision);return send(201,{data:data(),meta:{bannerID:prior.id,replay:true}});}
  if(revision!==profile.revision)return send(409,{code:'conflict'});
  if(req.method==='POST'){
   uploads++;banner={id:'banner-'+uploads,width:1200,height:600};profile={...profile,revision:revision+1};intents.set(key,{bytes,revision,id:banner.id});
   if(loseUpload){loseUpload=false;return send(503,{code:'unavailable'});}
   return send(201,{data:data(),meta:{bannerID:banner.id,replay:false}});
  }
  if(req.method==='DELETE'){removals++;banner=null;profile={...profile,revision:revision+1};if(loseRemoval){loseRemoval=false;return send(503,{code:'unavailable'});}return send(200,{data:data()});}
 }
 send(404,{code:'not_found'});
});
api.listen(0,'127.0.0.1');await once(api,'listening');
let log='';const port=api.address().port;const built=process.env.WEB_ACCEPTANCE_BUILT==='1';
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5192','--strictPort'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5192',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe'],detached:true});
web.stdout.on('data',d=>log+=d);web.stderr.on('data',d=>log+=d);
let browser,page;
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{if((await fetch(webURL)).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 await context.addInitScript(()=>{
 sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'banner-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()}));
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.bannerURLs=new Set();
 URL.createObjectURL=value=>{const url=create(value);window.bannerURLs.add(url);return url;};URL.revokeObjectURL=url=>{window.bannerURLs.delete(url);revoke(url);};
 });
 page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(webURL);
 await page.getByRole('button',{name:'Banner Workshop',exact:true}).click();
 await page.getByRole('button',{name:'Showroom banner',exact:true}).click();
 const picker=page.getByLabel('Choose banner image',{exact:true});
 const choose=async()=>{await picker.setInputFiles({name:'banner.jpg',mimeType:'image/jpeg',buffer:image});await page.getByRole('dialog').waitFor();};
 await picker.setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255])});
 await page.getByText('Choose a JPEG, PNG or WebP image no larger than 20 MB.',{exact:true}).waitFor();assert.equal(uploads,0);await page.waitForFunction(()=>window.bannerURLs.size===0);
 await choose();await page.keyboard.press('Escape');assert.equal(uploads,0);await page.waitForFunction(()=>window.bannerURLs.size===0);
 await choose();assert.equal(uploads,0);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(uploads,0);await page.waitForFunction(()=>window.bannerURLs.size===0);
 await choose();await page.getByRole('button',{name:'Use this banner',exact:true}).click();await page.getByRole('button',{name:'Retry this upload',exact:true}).waitFor();assert.equal(uploads,1);
 await page.getByRole('button',{name:'Retry this upload',exact:true}).click();await page.getByText('Your banner has been updated.',{exact:true}).waitFor();assert.equal(uploads,1);
 await page.getByRole('button',{name:'Remove banner',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(removals,0);
 await choose();profile={...profile,revision:profile.revision+1};await page.getByRole('button',{name:'Use this banner',exact:true}).click();
 await page.getByText('Refresh the current banner before reviewing another change.',{exact:true}).waitFor();assert.equal(uploads,1);
 await page.getByRole('button',{name:'Refresh banner',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(uploads,1);
 await page.getByRole('button',{name:'Use this banner',exact:true}).click();await page.getByText('Your banner has been updated.',{exact:true}).waitFor();assert.equal(uploads,2);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.waitForFunction(()=>window.bannerURLs.size>0);
 await page.screenshot({path:'/tmp/piano-owner-banner-mobile.png',fullPage:true});
 denied=true;await page.getByRole('button',{name:'Refresh banner',exact:true}).click();await page.getByText('You no longer have access to this banner.',{exact:true}).waitFor();await page.waitForFunction(()=>window.bannerURLs.size===0);
 denied=false;await page.getByRole('button',{name:'Refresh banner',exact:true}).click();await page.getByRole('button',{name:'Remove banner',exact:true}).waitFor();
 await page.getByRole('button',{name:'Remove banner',exact:true}).click();await page.getByRole('button',{name:'Remove banner now',exact:true}).click();
 await page.getByText('Refresh the current banner before reviewing another change.',{exact:true}).waitFor();assert.equal(removals,1);
 await page.getByRole('button',{name:'Refresh banner',exact:true}).click();await page.getByText('Your showroom uses its simple branded header until you add a banner.',{exact:true}).waitFor();assert.equal(removals,1);
 denied=true;await page.getByRole('button',{name:'Refresh banner',exact:true}).click();await page.getByText('You no longer have access to this banner.',{exact:true}).waitFor();await page.waitForFunction(()=>window.bannerURLs.size===0);
 denied=false;
 const spanish=await browser.newContext({locale:'es-ES',viewport:{width:390,height:844}});
 await spanish.addInitScript(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'banner-test-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 const translated=await spanish.newPage();await translated.goto(webURL);await translated.getByRole('button',{name:'Banner Workshop',exact:true}).click();await translated.getByRole('button',{name:'Imagen de la sala de exposición',exact:true}).click();
 await translated.getByLabel('Elegir imagen de portada',{exact:true}).setInputFiles({name:'banner.jpg',mimeType:'image/jpeg',buffer:image});
 await translated.getByRole('button',{name:'Usar esta imagen',exact:true}).waitFor();assert.equal(await translated.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await translated.screenshot({path:'/tmp/piano-owner-banner-spanish-review.png',fullPage:true});await translated.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(uploads,2);await spanish.close();
 console.log('Owner banner selection/cancel/invalid preview/Escape/Spanish, lost-upload replay, conflict refresh/review, replacement, removal cancel/uncertainty, narrow layout and denial clearing passed');
}catch(error){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:'/tmp/piano-owner-banner-failure.png',fullPage:true});}throw error;}
finally{await browser?.close();api.close();if(web.exitCode===null){process.kill(-web.pid,'SIGTERM');await once(web,'exit');}}
