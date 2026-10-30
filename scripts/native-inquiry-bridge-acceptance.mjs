import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:5189',siteKey='1x00000000000000000000AA';
const built=process.env.WEB_ACCEPTANCE_BUILT==='1';let log='';
const web=spawn(process.execPath,built?['apps/web/build/index.js']:['node_modules/vite/bin/vite.js','dev','--port','5189','--strictPort'],{cwd:built?'.':'apps/web',env:{...process.env,HOST:'127.0.0.1',PORT:'5189',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_INQUIRY_CHALLENGE_POLICY:'enabled',PIANOTECHPROS_TURNSTILE_SITE_KEY:siteKey,PIANOTECHPROS_API_URL:'http://127.0.0.1:18082',PIANOTECHPROS_SERVER_API_URL:'http://127.0.0.1:18082'},stdio:['ignore','pipe','pipe'],detached:true});
web.stdout.on('data',value=>log+=value);web.stderr.on('data',value=>log+=value);
let browser,context;
try{
 const url=origin+'/inquiry-verification?siteKey='+siteKey;
 for(let attempt=0;attempt<100;attempt++){if(web.exitCode!==null)throw Error(log);try{if((await fetch(url)).ok)break;}catch{}if(attempt===99)throw Error(log);await new Promise(resolve=>setTimeout(resolve,200));}
 const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow');
 for(const suffix of ['', '?siteKey=wrong','?siteKey='+siteKey+'&siteKey='+siteKey])assert.equal((await fetch(origin+'/inquiry-verification'+suffix)).status,503);
 browser=process.env.PIANO_BROWSER_CDP?await chromium.connectOverCDP(process.env.PIANO_BROWSER_CDP):await chromium.launch({headless:true});context=await browser.newContext();const page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.proofs=[];window.ReactNativeWebView={postMessage(value){window.proofs.push(JSON.parse(value));}};});
 await context.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render(element,options){window.widgetOptions=options;const button=document.createElement('button');button.textContent='Controlled verification';button.onclick=()=>options.callback('synthetic-proof');element.append(button);return 'widget';},remove(){},reset(){}};`}));
 await page.goto(url);await page.getByRole('button',{name:'Controlled verification'}).click();
 await page.waitForFunction(()=>window.proofs.at(-1)?.token==='synthetic-proof');
 assert.deepEqual(await page.evaluate(()=>({sitekey:window.widgetOptions.sitekey,action:window.widgetOptions.action,language:window.widgetOptions.language})),{sitekey:siteKey,action:'inquiry',language:'en'});
 assert.equal(await page.locator('input,textarea').count(),0);assert.equal(new URL(page.url()).searchParams.get('token'),null);
 await page.evaluate(()=>window.widgetOptions['expired-callback']());assert.deepEqual(await page.evaluate(()=>window.proofs.at(-1)),{type:'inquiry-proof',token:''});
 await page.getByRole('button',{name:'Controlled verification'}).click();await page.evaluate(()=>window.widgetOptions['error-callback']());await page.getByRole('button',{name:'Retry verification',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.proofs.at(-1).token),'');
 assert.deepEqual(errors,[]);
 const spanish=await context.newPage({});await spanish.setExtraHTTPHeaders({'Accept-Language':'es'});await spanish.goto(url);await spanish.getByRole('button',{name:'Controlled verification'}).waitFor();assert.equal(await spanish.evaluate(()=>window.widgetOptions.language),'es');
 console.log('Native inquiry hosted bridge: exact configuration, no-store, proof-only messages, expiry, failure and Spanish passed (controlled provider).');
}finally{await context?.close();await browser?.close();if(web.exitCode===null){process.kill(-web.pid,'SIGTERM');await once(web,'exit');}}
