import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright';
const apiPort=Number(process.env.DEALER_ACCEPTANCE_API_PORT??8089);
const base=process.env.DEALER_WEB_URL??'http://127.0.0.1:5179';
const token='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const link=base+'/scan#v=1&dealer=shop&token='+token;
const record={id:'piano',dealer_id:'shop',revision:3,status:'available',attributes:{stock_number:'PT-1',title:'',make:'Yamaha',model:'C3',asking_price:{minor_units:234500,currency:'EUR'},price_visible:false},created_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z'};
let publicationVisible=true,commands=0,lastCommand=null,actionDenied=false,publicationDenied=false,loseAction=false;
const publication=()=>({visible:publicationVisible,applied_revision:record.revision,snapshot:{id:'piano',dealer_id:'shop',publication_revision:2,status:record.status,stock_number:'PT-1',title:'Yamaha C3',featured:false,form:'grand',player_system:false,condition:'used',make:'Yamaha',model:'C3',manufactured:null,size:'',finish:'',description:'',price:null,photos:[{id:'cover',alt_text:''}]}});
let denied=false,unavailable=false,resolves=0,reads=0;const requests=[];
const server=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',base);res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 requests.push(req.url);const send=(status,body)=>{res.writeHead(status).end(JSON.stringify(body));};
 if(req.headers.authorization!=='Bearer scan-browser-session')return send(401,{code:'unauthenticated'});
 if(req.url==='/v1/me')return send(200,{data:{id:'viewer',email:'viewer@example.com',displayName:'Viewer'}});
 if(req.url==='/v1/session'&&req.method==='DELETE'){res.writeHead(204).end();return;}
 if(req.url==='/v1/dealers/shop/inventory/scan/resolve'&&req.method==='POST'){
  resolves++;const chunks=[];for await(const chunk of req)chunks.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(chunks)),{token});
  return send(denied?404:unavailable?503:200,denied?{code:'not_found'}:unavailable?{code:'unavailable'}:{data:{dealer_id:'shop',record_id:'piano'}});
 }
 if(req.url==='/v1/dealers/shop/inventory/piano/publication')return send(publicationDenied?403:200,publicationDenied?{code:'forbidden'}:{data:{record,publication:publication()}});
 if(['/v1/dealers/shop/inventory/piano/unpublish','/v1/dealers/shop/inventory/piano/lifecycle'].includes(req.url)&&req.method==='POST'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const command=JSON.parse(Buffer.concat(chunks));
  if(actionDenied)return send(403,{code:'forbidden'});
  if(command.expectedRevision!==record.revision)return send(409,{code:'conflict'});
  commands++;lastCommand=command;record.revision++;if(req.url.endsWith('/unpublish'))publicationVisible=false;else record.status=command.status;
  if(loseAction){loseAction=false;return send(503,{code:'unavailable'});}
  return send(200,{data:{record,publication:publication()}});
 }
 if(req.url==='/v1/dealers/shop/inventory/piano/photos'){reads++;return send(200,{data:{record,photos:[]}});}
 return send(404,{code:'not_found'});
});
server.listen(apiPort,'127.0.0.1');await once(server,'listening');const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 const page=await context.newPage();let fragmentAtAPI=false;page.on('request',req=>{if(new URL(req.url()).port===String(apiPort)&&new URL(page.url()).hash)fragmentAtAPI=true;});
 await page.goto(base+'/scan');await page.getByRole('alert').waitFor();await page.evaluate(()=>sessionStorage.setItem('pianotechpros_application_session',JSON.stringify({token:'scan-browser-session',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 await page.goto(base+'/');
 const response=await page.goto(link);assert.equal(response.headers()['cache-control'],'no-store');assert.equal(response.headers()['referrer-policy'],'no-referrer');await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(fragmentAtAPI,false);assert.equal(resolves,1);assert.equal(reads,1);assert.ok(requests.every(url=>!url.includes(token)));
 const actions=page.locator('section.scan-actions');await actions.getByRole('button',{name:'Review unpublishing',exact:true}).click();
 const review=actions.getByRole('dialog');await review.waitFor();assert.equal(commands,0);await page.keyboard.press('Escape');await review.waitFor({state:'hidden'});assert.equal(commands,0);
 await actions.getByRole('button',{name:'Review unpublishing',exact:true}).click();await review.getByRole('button',{name:'Confirm change',exact:true}).click();await page.getByText('Change confirmed.',{exact:true}).waitFor();assert.equal(commands,1);assert.equal(publicationVisible,false);
 await actions.locator('select').first().selectOption('sold');assert.equal(await actions.locator('input[inputmode=decimal]').inputValue(),'2345.00');assert.equal(await actions.locator('select').nth(1).inputValue(),'EUR');await actions.locator('input[inputmode=decimal]').fill('');await actions.locator('select').first().selectOption('reserved');await actions.locator('select').first().selectOption('sold');assert.equal(await actions.locator('input[inputmode=decimal]').inputValue(),'');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();assert.equal(commands,1);
 await actions.locator('input[inputmode=decimal]').fill('1234.50');await actions.locator('select').nth(1).selectOption('USD');await actions.locator('select').first().selectOption('reserved');await actions.locator('select').first().selectOption('sold');assert.equal(await actions.locator('input[inputmode=decimal]').inputValue(),'1234.50');assert.equal(await actions.locator('select').nth(1).inputValue(),'USD');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();await review.waitFor();record.revision++;await review.getByRole('button',{name:'Confirm change',exact:true}).click();await actions.getByText('The record changed after review. Review the latest version before confirming again.',{exact:true}).waitFor();assert.equal(commands,1);
 await actions.getByRole('button',{name:'Review availability change',exact:true}).click();await review.getByRole('button',{name:'Confirm change',exact:true}).click();await page.getByText('Change confirmed.',{exact:true}).waitFor();assert.equal(commands,2);assert.equal(record.status,'sold');assert.deepEqual(lastCommand.salePrice,{minor_units:123450,currency:'USD'});
 await actions.locator('input[inputmode=decimal]').fill('4567.89');await actions.locator('select').nth(1).selectOption('CAD');await actions.locator('select').first().selectOption('reserved');await actions.locator('select').first().selectOption('sold');assert.equal(await actions.locator('input[inputmode=decimal]').inputValue(),'4567.89');assert.equal(await actions.locator('select').nth(1).inputValue(),'CAD');
 const beforeActionDenial=resolves;actionDenied=true;await actions.locator('select').first().selectOption('available');await actions.locator('textarea').fill('Correcting synthetic sale');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();await review.getByRole('button',{name:'Confirm change',exact:true}).click();await page.getByText('This action was denied. Your access to this piano has been checked again.',{exact:true}).waitFor();assert.equal(commands,2);await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();assert.equal(resolves,beforeActionDenial+1);actionDenied=false;
 await page.getByRole('button',{name:'Refresh piano',exact:true}).click();await actions.locator('select').first().selectOption('reserved');await actions.locator('textarea').fill('Correcting synthetic sale');await actions.getByRole('button',{name:'Review availability change',exact:true}).click();loseAction=true;await review.getByRole('button',{name:'Confirm change',exact:true}).click();await actions.getByText('The result is uncertain. Refresh the current status before deciding what to do next. This command will not retry automatically.',{exact:true}).waitFor();assert.equal(commands,3);assert.equal(record.status,'reserved');await actions.getByRole('button',{name:'Refresh publication status',exact:true}).click();await actions.getByText('Reserved · Published snapshot is hidden',{exact:true}).waitFor();assert.equal(commands,3);assert.equal(publication().snapshot.publication_revision,2);
 publicationDenied=true;const beforeReadDenial=resolves;await page.getByRole('button',{name:'Refresh piano',exact:true}).click();await actions.getByRole('button',{name:'Refresh publication status',exact:true}).waitFor();await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();assert.equal(resolves,beforeReadDenial+2);
 denied=true;await actions.getByRole('button',{name:'Refresh publication status',exact:true}).click();await page.locator('section[aria-labelledby=scan-heading]').getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Yamaha C3',exact:true}).count(),0);assert.equal(await actions.count(),0);denied=false;publicationDenied=false;await page.goto(link);await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();
 unavailable=true;await page.getByRole('button',{name:'Refresh piano',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Yamaha C3',exact:true}).count(),0);unavailable=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();
 denied=true;await page.getByRole('button',{name:'Refresh piano',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Yamaha C3',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).count(),0);denied=false;
 const before=resolves;await page.evaluate(value=>{window.location.hash=value;},new URL(link+'&extra=1').hash);await page.getByRole('alert').waitFor();assert.equal(resolves,before);assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).count(),0);
 await page.evaluate(value=>sessionStorage.setItem('pianotechpros_scan_continuation',JSON.stringify({version:1,link:value,expiresAt:Date.now()+600000})),link);
 await page.goto(base+'/scan');await page.getByRole('heading',{name:'Yamaha C3',exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('pianotechpros_scan_continuation')),null);
 await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('pianotechpros-inventory-recovery',2);request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);}));
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Yamaha C3',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>sessionStorage.getItem('pianotechpros_application_session')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('pianotechpros_scan_continuation')),null);
 await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('pianotechpros-inventory-recovery');request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);}));
 await page.getByRole('button',{name:'Retry draft cleanup',exact:true}).click();await page.waitForURL(base+'/');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('pianotechpros_application_session')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('pianotechpros_scan_continuation')),null);
 console.log('PASS: scan fragment consumed before API, no-store/referrer headers, scoped identity display, transient retry, denial clearing, invalid link rejection, bounded continuation consumption and sign-out; scan action cancellation, sale amount, revision conflict, command denial and lost-response no-retry');
}finally{await browser.close();server.close();}
