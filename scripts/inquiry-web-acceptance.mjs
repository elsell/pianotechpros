import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const profile={id:'atelier',name:'Atelier Pianos',slug:'atelier',email:'shop?bcc=other@example.com',phone:'+1 555 0100',website_url:'https://example.com',tagline:'A piano for your next chapter',description:'Thoughtfully selected instruments, ready to be played.',street_address_1:'12 Example Street',street_address_2:'',city:'Portland',region:'OR',postal_code:'97201',appointment_note:'Visit by appointment.',delivery_note:'Ask us about delivery.',warranty_note:'Every piano is carefully inspected.',service_note:'Tuning and care, for years to come.',banner_alt_text:'',accent_color:'#245346'};
const piano={id:'grand',dealer_id:'atelier',publication_revision:2,status:'available',stock_number:'PT-1',title:'Walnut baby grand',featured:true,form:'grand',player_system:false,condition:'used',make:'Example maker',model:'Studio',manufactured:null,size:'5 ft',finish:'Walnut',description:'A warm, expressive instrument for a welcoming room.',price:{minor_units:1250000,currency:'USD'},photos:[{id:'front',alt_text:'Walnut baby grand, front view'},{id:'keys',alt_text:'Keyboard detail'}]};
const upright={...piano,id:'upright',title:'Studio upright',featured:false,form:'studio_upright',stock_number:'PT-2',price:null};
const image=readFileSync(new URL('./fixtures/showroom.jpg',import.meta.url));
let published=true;const requests=[];let delivery='unavailable';const submissions=[];
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5187');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);requests.push(req.url);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const url=new URL(req.url,'http://localhost');const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method==='POST'&&url.pathname==='/v1/showrooms/atelier/pianos/grand/inquiries'){let raw='';for await(const chunk of req)raw+=chunk;submissions.push(JSON.parse(raw));if(delivery==='accepted'){res.writeHead(204).end();return;}return send(delivery==='rate'?429:delivery==='challenge'?400:503,{code:delivery==='challenge'?'inquiry_challenge_rejected':'unavailable',detail:'PRIVATE'});}
 if(!published)return send(404,{code:'not_found',detail:'PRIVATE'});
 if(url.pathname.includes('/photos/')){res.setHeader('Content-Type','image/jpeg');res.end(image);return;}
 if(url.pathname==='/v1/showrooms/atelier/pianos'){
  let pianos=[piano,upright];if(url.searchParams.get('search'))pianos=pianos.filter(p=>p.title.toLowerCase().includes(url.searchParams.get('search').toLowerCase()));
  if(url.searchParams.get('form'))pianos=pianos.filter(p=>p.form===url.searchParams.get('form'));
  if(url.searchParams.get('currency'))pianos=pianos.filter(p=>p.price?.currency===url.searchParams.get('currency'));
  if(url.searchParams.has('maxPrice'))pianos=pianos.filter(p=>p.price&&p.price.minor_units<=Number(url.searchParams.get('maxPrice')));
  return send(200,{data:{profile,pianos},meta:{}});
 }
 const id=url.pathname.split('/').at(-1);const found=[piano,upright].find(p=>p.id===id);return found?send(200,{data:{profile,piano:found}}):send(404,{code:'not_found'});
});
api.listen(0,'127.0.0.1');await once(api,'listening');const port=api.address().port;
const webURL='http://127.0.0.1:5187';let log='';
const built=process.env.WEB_ACCEPTANCE_BUILT==='1';
// Official public test site key; optional live-provider acceptance, not a credential.
const failChallenge=process.env.INQUIRY_TEST_TURNSTILE_FAILURE==='1';
const liveChallenge=process.env.INQUIRY_TEST_TURNSTILE==='1'||failChallenge;
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5187','--strictPort'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5187',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_INQUIRY_CHALLENGE_POLICY:liveChallenge?'enabled':'disabled',PIANOTECHPROS_TURNSTILE_SITE_KEY:liveChallenge?'1x00000000000000000000AA':'',PIANOTECHPROS_API_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe'],detached:true});web.stdout.on('data',d=>log+=d);web.stderr.on('data',d=>log+=d);
let browser;let evidencePage;const errors=[];
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{const response=await fetch(webURL);if(response.ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,args:failChallenge?['--host-resolver-rules=MAP challenges.cloudflare.com ~NOTFOUND']:[]});const page=await browser.newPage({viewport:{width:1280,height:900}});evidencePage=page;page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 const html=await fetch(webURL+'/showrooms/atelier');assert.equal(html.headers.get('cache-control'),'no-store');
 const csp=html.headers.get('content-security-policy');assert.match(csp,/default-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/script-src[^;]*'nonce-[^']+'/);assert.equal(html.headers.get('x-content-type-options'),'nosniff');assert.equal(html.headers.get('referrer-policy'),'no-referrer');
 if(liveChallenge){assert.match(csp,/script-src[^;]*https:\/\/challenges.cloudflare.com/);assert.match(csp,/frame-src https:\/\/challenges.cloudflare.com/);}else assert.ok(!csp.includes('challenges.cloudflare.com'));
 const source=await html.text();assert.ok(source.includes('Walnut baby grand'));assert.ok(!source.includes('PRIVATE'));
 await page.goto(webURL+'/showrooms/atelier');await page.getByRole('heading',{name:'Walnut baby grand'}).waitFor();
 assert.equal(await page.locator('#svelte-announcer').evaluate(el=>getComputedStyle(el).clipPath),'inset(50%)');
 assert.equal(await page.getByRole('heading',{name:'Studio upright'}).count(),1);
 await page.locator('summary').click();await page.getByLabel('Piano type',{exact:true}).selectOption('studio_upright');await page.getByRole('button',{name:'Show pianos',exact:true}).click();await page.waitForURL(/form=studio_upright/);assert.equal(await page.getByRole('heading',{name:'Walnut baby grand'}).count(),0);
 await page.getByRole('link',{name:'Clear filters',exact:true}).click();await page.getByRole('heading',{name:'Walnut baby grand'}).click();await page.getByRole('heading',{level:1,name:'Walnut baby grand'}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.gallery-controls button')?.disabled);await page.getByRole('button',{name:'Next photo',exact:true}).focus();await page.keyboard.press('Enter');await page.getByText('Photo 2 of 2',{exact:true}).waitFor();assert.ok(await page.locator('.hero img').evaluate(img=>img.complete&&img.naturalWidth>0));
 await page.getByRole('button',{name:'Previous photo',exact:true}).click();await page.getByText('Photo 1 of 2',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Call the showroom',exact:true}).first().getAttribute('href'),'tel:+15550100');
 assert.equal(await page.locator('.contact .secondary').getAttribute('href'),'mailto:shop%3Fbcc%3Dother%40example.com?subject=Walnut%20baby%20grand');
 if(failChallenge){
  await page.getByLabel('Your name',{exact:true}).fill('Private buyer');await page.getByRole('button',{name:'Retry verification',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Send inquiry',exact:true}).isDisabled(),true);assert.equal(submissions.length,0);
  await page.getByRole('button',{name:'Retry verification',exact:true}).click();await page.getByRole('button',{name:'Retry verification',exact:true}).waitFor();assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),'Private buyer');assert.equal(submissions.length,0);
 }else{
 await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByText('Check the highlighted fields.',{exact:true}).waitFor();assert.equal(submissions.length,0);assert.equal(await page.locator('.feedback').evaluate(el=>el===document.activeElement),true);
 await page.getByLabel('Your name',{exact:true}).fill(' Buyer ');await page.getByLabel('Email address',{exact:true}).fill('buyer@example.com');await page.getByLabel('Your message',{exact:true}).fill('Can I arrange a visit?');
 await page.getByLabel('How should we contact you?',{exact:true}).selectOption('phone');await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.locator('#inquiry-error-phone').waitFor();assert.equal(submissions.length,0);
 await page.getByLabel('Phone (optional)',{exact:true}).fill('+1 555 0101');await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByText('We could not confirm delivery. Please try again later or contact the dealer directly.',{exact:true}).waitFor();assert.equal(submissions.length,1);assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),' Buyer ');assert.equal(await page.getByText('PRIVATE',{exact:true}).count(),0);
 delivery='challenge';await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByText('Please complete verification again before sending.',{exact:true}).waitFor();
 delivery='rate';await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByText('Too many messages were sent recently. Please wait a minute before trying again.',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/piano-inquiry-form-mobile.png',fullPage:true});
 delivery='accepted';await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByRole('heading',{name:'Your inquiry has been received by the dealer.'}).waitFor();assert.equal(submissions.length,4);assert.equal(submissions.at(-1).name,'Buyer');if(liveChallenge)assert.ok(submissions.at(-1).challenge.length>0);assert.equal(await page.locator('#inquiry-email').count(),0);assert.equal(await page.locator('.feedback').evaluate(el=>el===document.activeElement),true);
 const spanish=await browser.newPage({locale:'es-ES'});await spanish.goto(webURL+'/showrooms/atelier/pianos/grand');await spanish.getByRole('heading',{name:'Preguntar por este piano'}).waitFor();await spanish.getByLabel('Tu nombre',{exact:true}).fill('Nombre privado');await spanish.goto(webURL+'/showrooms/atelier');await spanish.goto(webURL+'/showrooms/atelier/pianos/grand');assert.equal(await spanish.getByLabel('Tu nombre',{exact:true}).inputValue(),'');await spanish.close();
 }
 published=false;await page.reload();await page.getByText('This showroom or piano is no longer available.',{exact:true}).waitFor();assert.equal(await page.getByText('PRIVATE',{exact:true}).count(),0);
 assert.deepEqual(errors.filter(message=>!(failChallenge&&message.includes('net::ERR_NAME_NOT_RESOLVED'))&&!/^Failed to load resource: the server responded with a status of (400|404|429|503) /.test(message)),[]);assert.ok(requests.some(p=>p.includes('/photos/')));
 console.log(failChallenge?'Turnstile DNS failure, retry, contact preservation and disabled submission acceptance passed':'Buyer inquiry validation, failure preservation, explicit retry, confirmed clearing, focus, narrow layout and Spanish acceptance passed');
}catch(error){console.error(errors);if(evidencePage){console.error(await evidencePage.locator('body').innerText());await evidencePage.screenshot({path:'/tmp/piano-showroom-browser-failure.png',fullPage:true});}throw error;}finally{await browser?.close();api.close();if(web.exitCode===null){process.kill(-web.pid,'SIGTERM');await once(web,'exit');}}
