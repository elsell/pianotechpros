import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const profile={banner:{id:"current",width:1200,height:600},id:'atelier',name:'Atelier Pianos',slug:'atelier',email:'shop?bcc=other@example.com',phone:'+1 555 0100',website_url:'https://example.com',tagline:'A piano for your next chapter',description:'Thoughtfully selected instruments, ready to be played.',street_address_1:'12 Example Street',street_address_2:'',city:'Portland',region:'OR',postal_code:'97201',appointment_note:'Visit by appointment.',delivery_note:'Ask us about delivery.',warranty_note:'Every piano is carefully inspected.',service_note:'Tuning and care, for years to come.',banner_alt_text:'',accent_color:'#245346'};
const piano={id:'grand',dealer_id:'atelier',publication_revision:2,status:'available',stock_number:'PT-1',title:'Walnut baby grand',featured:true,form:'grand',player_system:false,condition:'used',make:'Example maker',model:'Studio',manufactured:null,size:'5 ft',finish:'Walnut',description:'A warm, expressive instrument for a welcoming room.',price:{minor_units:1250000,currency:'USD'},photos:[{id:'front',alt_text:'Walnut baby grand, front view'},{id:'keys',alt_text:'Keyboard detail'}]};
const upright={...piano,id:'upright',title:'Studio upright',featured:false,form:'studio_upright',stock_number:'PT-2',price:null};
const aliasPiano={...piano,id:'12345678-1234-4234-8234-123456789abc'};
const image=readFileSync(new URL('./fixtures/showroom.jpg',import.meta.url));
let published=true,relatedFailure=false;const requests=[];
const api=createServer((req,res)=>{
 assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);requests.push(req.url);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const url=new URL(req.url,'http://localhost');const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(!published)return send(404,{code:'not_found',detail:'PRIVATE'});
 if(url.pathname.includes('/photos/')||url.pathname==='/v1/showrooms/atelier/banner/current'){res.setHeader('Content-Type','image/jpeg');res.end(image);return;}
 if(url.pathname==='/v1/showrooms/atelier/pianos'){
  if(relatedFailure&&url.searchParams.get('limit')==='4')return send(503,{code:'unavailable'});
  let pianos=[piano,upright];if(url.searchParams.get('search'))pianos=pianos.filter(p=>p.title.toLowerCase().includes(url.searchParams.get('search').toLowerCase()));
  if(url.searchParams.get('form'))pianos=pianos.filter(p=>p.form===url.searchParams.get('form'));
  if(url.searchParams.get('currency'))pianos=pianos.filter(p=>p.price?.currency===url.searchParams.get('currency'));
  if(url.searchParams.has('maxPrice'))pianos=pianos.filter(p=>p.price&&p.price.minor_units<=Number(url.searchParams.get('maxPrice')));
  return send(200,{data:{profile,pianos},meta:{}});
 }
 const id=url.pathname.split('/').at(-1);const found=[piano,upright,aliasPiano].find(p=>p.id===id);return found?send(200,{data:{profile,piano:found}}):send(404,{code:'not_found'});
});
api.listen(0,'127.0.0.1');await once(api,'listening');const port=api.address().port;
const webURL='http://127.0.0.1:5187';let log='';
const built=process.env.WEB_ACCEPTANCE_BUILT==='1';
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5187','--strictPort'],{env:{...process.env,HOST:'127.0.0.1',PORT:'5187',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_PUBLIC_WEB_ORIGIN:'https://pianos.example',PIANOTECHPROS_API_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe'],detached:true});web.stdout.on('data',d=>log+=d);web.stderr.on('data',d=>log+=d);
let browser;let evidencePage;const errors=[];
try{
 for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error(log);try{const response=await fetch(webURL);if(response.ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 const canonical='/showrooms/atelier/pianos/walnut-baby-grand-'+aliasPiano.id;
 for(const segment of [aliasPiano.id,'old-title-'+aliasPiano.id]){
  const redirected=await fetch(webURL+'/showrooms/atelier/pianos/'+segment+'?secret=never-copy',{redirect:'manual'});
  assert.equal(redirected.status,307);assert.equal(redirected.headers.get('location'),canonical);
  assert.equal(redirected.headers.get('cache-control'),'no-store');
 }
 const canonicalResponse=await fetch(webURL+canonical);assert.equal(canonicalResponse.status,200);
 const beforeInvalid=requests.length;
 const invalid=await fetch(webURL+'/showrooms/atelier/pianos/prefix-'+aliasPiano.id+'-suffix');assert.equal(invalid.status,404);
 assert.equal(requests.length,beforeInvalid);
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});evidencePage=page;page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 const html=await fetch(webURL+'/showrooms/atelier');assert.equal(html.headers.get('cache-control'),'no-store');
 const csp=html.headers.get('content-security-policy');assert.match(csp,/default-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/script-src[^;]*'nonce-[^']+'/);assert.equal(html.headers.get('x-content-type-options'),'nosniff');assert.equal(html.headers.get('referrer-policy'),'no-referrer');
 const source=await html.text();assert.ok(source.includes('Walnut baby grand'));assert.ok(!source.includes('PRIVATE'));
 await page.goto(webURL+'/showrooms/atelier');await page.getByRole('heading',{name:'Walnut baby grand'}).waitFor();
 await page.getByRole('img',{name:'Atelier Pianos showroom',exact:true}).waitFor();
 await page.waitForFunction(()=>{const image=document.querySelector('.banner img');return image?.complete&&image.naturalWidth>0;});
 const bannerResponse=await fetch(webURL+'/showrooms/atelier/banner/current');assert.equal(bannerResponse.status,200);assert.equal(bannerResponse.headers.get('cache-control'),'no-store');assert.equal(bannerResponse.headers.get('x-content-type-options'),'nosniff');
 assert.equal(await page.locator('#svelte-announcer').evaluate(el=>getComputedStyle(el).clipPath),'inset(50%)');
 assert.equal(await page.getByRole('heading',{name:'Studio upright'}).count(),1);
 await page.locator('summary').click();await page.getByLabel('Piano type',{exact:true}).selectOption('studio_upright');await page.getByRole('button',{name:'Show pianos',exact:true}).click();await page.waitForURL(/form=studio_upright/);assert.equal(await page.getByRole('heading',{name:'Walnut baby grand'}).count(),0);
 await page.getByRole('link',{name:'Clear filters',exact:true}).click();await page.getByRole('heading',{name:'Walnut baby grand'}).click();await page.getByRole('heading',{level:1,name:'Walnut baby grand'}).waitFor();
 assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://pianos.example/showrooms/atelier/pianos/grand');
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.getByRole('button',{name:'Copy public link',exact:true}).click();
 await page.getByText('Public link copied.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://pianos.example/showrooms/atelier/pianos/grand');
 const structured=JSON.parse(await page.locator('script[data-public-discovery]').textContent());
 assert.equal(structured['@type'],'Product');assert.equal(structured.offers.price,'12500.00');assert.equal(structured.offers.availability,'https://schema.org/InStock');
 assert.equal(structured.serial,undefined);assert.equal(structured.review,undefined);
 const originalDescription=piano.description;
 piano.description='</script><script>globalThis.injected=true</script>';
 const inertHTML=await (await fetch(webURL+'/showrooms/atelier/pianos/grand')).text();
 const inertJSON=JSON.parse(inertHTML.match(/<script type="application\/ld\+json" data-public-discovery>(.*?)<\/script>/s)[1]);
 assert.equal(inertJSON.description,piano.description);assert.equal(inertHTML.includes('<script>globalThis.injected=true</script>'),false);
 piano.description=originalDescription;
 const hiddenPriceHTML=await (await fetch(webURL+'/showrooms/atelier/pianos/upright')).text();
 const hiddenPriceJSON=JSON.parse(hiddenPriceHTML.match(/<script type="application\/ld\+json" data-public-discovery>(.*?)<\/script>/s)[1]);assert.equal(hiddenPriceJSON.offers,undefined);
 await page.waitForFunction(()=>!document.querySelector('.gallery-controls button')?.disabled);await page.getByRole('button',{name:'Next photo',exact:true}).focus();await page.keyboard.press('Enter');await page.getByText('Photo 2 of 2',{exact:true}).waitFor();assert.ok(await page.locator('.hero img').evaluate(img=>img.complete&&img.naturalWidth>0));
 await page.getByRole('button',{name:'Previous photo',exact:true}).click();await page.getByText('Photo 1 of 2',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Call the showroom',exact:true}).first().getAttribute('href'),'tel:+15550100');
 assert.equal(await page.locator('.contact .secondary').getAttribute('href'),'mailto:shop%3Fbcc%3Dother%40example.com?subject=Walnut%20baby%20grand');
 await page.locator('.related').getByRole('heading',{name:'Studio upright',exact:true}).waitFor();
 assert.equal(await page.locator('.related').getByRole('heading',{name:'Walnut baby grand',exact:true}).count(),0);
 relatedFailure=true;await page.reload();await page.getByRole('heading',{level:1,name:'Walnut baby grand'}).waitFor();
 await page.getByText('Other pianos could not be loaded. Browse the showroom to see what is available.',{exact:true}).waitFor();
 relatedFailure=false;await page.reload();await page.locator('.related').getByRole('heading',{name:'Studio upright',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/piano-showroom-detail-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/piano-showroom-detail-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Back to the showroom',exact:true}).click();await page.getByRole('heading',{name:'Studio upright'}).waitFor();await page.screenshot({path:'/tmp/piano-showroom-grid-mobile.png',fullPage:true});
 const spanish=await browser.newPage({locale:'es-ES'});await spanish.goto(webURL+'/showrooms/atelier');await spanish.getByText('Precio a consultar',{exact:true}).waitFor();await spanish.getByRole('img',{name:'Sala de exposición de Atelier Pianos',exact:true}).waitFor();await spanish.close();
 published=false;const hiddenAlias=await fetch(webURL+'/showrooms/atelier/pianos/old-title-'+aliasPiano.id,{redirect:'manual'});assert.equal(hiddenAlias.status,404);assert.equal(hiddenAlias.headers.get('location'),null);const hiddenBanner=await fetch(webURL+'/showrooms/atelier/banner/current');assert.equal(hiddenBanner.status,404);assert.equal(hiddenBanner.headers.get('cache-control'),'no-store');await page.reload();await page.getByText('This showroom or piano is no longer available.',{exact:true}).waitFor();assert.equal(await page.getByText('PRIVATE').count(),0);
 assert.deepEqual(errors.filter(message=>message!=='Failed to load resource: the server responded with a status of 404 (Not Found)'),[]);assert.ok(requests.some(p=>p.includes('/photos/')));
 console.log('Public SSR, filtering, listing/gallery keyboard navigation, contact links, narrow layout, Spanish and unpublish acceptance passed');
}catch(error){console.error(errors);if(evidencePage){console.error(await evidencePage.locator('body').innerText());await evidencePage.screenshot({path:'/tmp/piano-showroom-browser-failure.png',fullPage:true});}throw error;}finally{await browser?.close();api.close();if(web.exitCode===null){process.kill(-web.pid,'SIGTERM');await once(web,'exit');}}
