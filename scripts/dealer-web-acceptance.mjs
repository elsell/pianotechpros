import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';

async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('controlled_request_not_observed')),15000);})]);}finally{clearTimeout(timer);}}

const webURL = process.env.DEALER_WEB_URL || 'http://127.0.0.1:5179';
const publications=new Map();let publicationCommands=0;let losePublication=false;let advanceAfterPublication=true;
let imageBytes=Buffer.alloc(0);let photoUploads=0;let losePhoto=false;const recordPhotos=new Map();const photoIntents=new Map();
const shops = new Map(['atelier', 'studio'].map((id) => [id, { id, name: id === 'atelier' ? 'Atelier Pianos' : 'Studio Pianos', email: `${id}@example.com`, slug: id, revision: 1, accent_color: '#123456', showroom_published: false }]));
let refreshMode = 'failure';
let rotations = 0;
const sessions = new Set(['browser-test-session']);
const members = new Map([['test-owner', { userID: 'test-owner', role: 'owner', revision: 1, active: true, grantPending: false }], ['test-editor', { userID: 'test-editor', role: 'editor', revision: 1, active: true, grantPending: false }]]);
const staffInvitations = new Map();
let staffConflict = true;
let inventoryMode = 'normal';
let editorMode = 'normal';
const captureIntents = new Map();const capturedRecords = new Map();let captureCreates = 0;let loseCapture = true;
let editorWrites = 0;let editorVoiceFields=[];
let voiceMode='normal';let voiceCalls=0;let audioCalls=0;
let inquiryDenied=false;let inquiryWrites=0;let inquiryRead=false;
const inquiryPiano={id:'concert',dealer_id:'created-shop',publication_revision:2,status:'available',stock_number:'PT-1',title:'Historical grand',featured:false,form:'grand',player_system:false,condition:'used',make:'',model:'',manufactured:null,size:'',finish:'',description:'Published description',price:null,photos:[{id:'photo',alt_text:''}]};
const inquiryEntry=()=>({id:'buyer-inquiry',dealerName:'My edited shop',dealerSlug:'my-shop',piano:inquiryPiano,contact:{name:'Synthetic buyer',email:'buyer@example.com',phone:'+1 555 0101',message:'Could I visit on Saturday?',preference:'email'},createdAt:'2026-10-25T00:00:00Z',revision:inquiryRead?2:1,...(inquiryRead?{readAt:'2026-10-25T00:01:00Z',readBy:'test-owner'}:{})});
let editorRecord = { id: 'concert', dealer_id: 'created-shop', revision: 1, status: 'available', attributes: { stock_number: 'concert', title: 'Concert Grand', featured: true }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' };
let denyStaff = false;
let invitationAccepted = false;
let accessChecks = 0;
const joinToken = 'A'.repeat(43);
const creations = new Map();
let createRequests = 0;
let conflictOnce = true;
let firstPageReads = 0;
let releaseRefresh;
let refreshRequested;
const requestedRefresh = new Promise((resolve) => { refreshRequested = resolve; });
const heldRefresh = new Promise((resolve) => { releaseRefresh = resolve; });
let releaseDetail;
let detailRequested;
const requested = new Promise((resolve) => { detailRequested = resolve; });
const held = new Promise((resolve) => { releaseDetail = resolve; });
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', webURL);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,idempotency-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (!sessions.has(req.headers.authorization?.replace(/^Bearer /, ''))) return send(401, { code: 'unauthenticated' });
  const url = new URL(req.url, 'http://localhost');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const rawBytes=Buffer.concat(chunks);const raw=rawBytes.toString();
  const body=rawBytes.length&&req.headers['content-type']?.includes('application/json')?JSON.parse(rawBytes.toString()):{};
  if(url.pathname.endsWith('/voice/transcribe')){
    audioCalls++;assert.ok(rawBytes.length>0&&rawBytes.length<=6*1024*1024);assert.match(req.headers['content-type'],/^audio\//);
    if(Number(url.searchParams.get('expectedRevision'))!==editorRecord.revision)return send(409,{code:'conflict'});
    return send(200,{data:{revision:editorRecord.revision,transcript:'Steinway Model B'}});
  }
  if(url.pathname.endsWith('/voice/extract')){
    voiceCalls++;if(voiceMode==='failure')return send(503,{code:'unavailable'});
    if(body.expectedRevision!==editorRecord.revision)return send(409,{code:'conflict'});
    return send(200,{data:{revision:editorRecord.revision,transcript:body.transcript,candidates:[
      {field:'make',value:{text:'Steinway'},confidence:'high',evidence:'Steinway'},
      {field:'model',value:{text:'Model B'},confidence:'uncertain',evidence:'Model B'},
    ]}});
  }
  if(url.pathname.startsWith('/v1/dealers/created-shop/inquiries')){if(inquiryDenied)return send(404,{code:'not_found'});if(req.method==='POST'){inquiryWrites++;inquiryRead=true;return send(409,{code:'conflict'});}return send(200,url.pathname.endsWith('/inquiries')?{data:[inquiryEntry()],meta:{}}:{data:inquiryEntry()});}
  const publicationRoute=/^\/v1\/dealers\/created-shop\/inventory\/([^/]+)\/(publication|publish|unpublish|lifecycle)$/.exec(url.pathname);
  if(publicationRoute){
    const [,id,action]=publicationRoute;let record=id==='concert'?editorRecord:capturedRecords.get(id);if(!record)return send(404,{code:'not_found'});
    const data=()=>({record,publication:publications.get(id)??null});
    if(req.method==='GET')return send(200,{data:data()});
    if(body.expectedRevision!==record.revision)return send(409,{code:'conflict'});
    const a=record.attributes;const photos=recordPhotos.get(id)??[];
    if(action==='publish'){
      const missing=[];if(!a.form)missing.push('form');if(!a.condition)missing.push('condition');if(!a.title&&!a.make)missing.push('title');if(!photos.length)missing.push('photo');if(missing.length)return send(422,{code:'inventory_not_ready',missing});
    }
    publicationCommands++;record={...record,revision:record.revision+1,status:action==='publish'&&record.status==='draft'?'available':action==='lifecycle'?body.status:record.status};
    let publication=publications.get(id);
    if(action==='publish')publication={visible:true,applied_revision:record.revision,snapshot:{id,dealer_id:record.dealer_id,publication_revision:record.revision,status:record.status,stock_number:a.stock_number,title:a.title||[a.make,a.model].filter(Boolean).join(' '),featured:!!a.featured,form:a.form,player_system:!!a.player_system,condition:a.condition,make:a.make??'',model:a.model??'',manufactured:a.manufactured??null,size:a.size??'',finish:a.finish??'',description:a.description??'',price:a.price_visible?a.asking_price??null:null,photos:photos.map(p=>({id:p.id,alt_text:p.altText}))}};
    else if(publication)publication={...publication,applied_revision:record.revision,visible:action==='unpublish'||['draft','in_service','archived'].includes(record.status)?false:publication.visible,snapshot:{...publication.snapshot,status:record.status}};
    if(id==='concert')editorRecord=record;else capturedRecords.set(id,record);if(publication)publications.set(id,publication);
    if(losePublication){losePublication=false;return send(503,{code:'unavailable'});}send(200,{data:data()});
    if(action==='publish'&&advanceAfterPublication){advanceAfterPublication=false;const newer={...record,revision:record.revision+1};if(id==='concert')editorRecord=newer;else capturedRecords.set(id,newer);}return;
  }
  const photoRoute=/^\/v1\/dealers\/created-shop\/inventory\/([^/]+)\/photos(?:\/(.*))?$/.exec(url.pathname);
  if(photoRoute){
    const [,id,suffix]=photoRoute;const record=id==='concert'?editorRecord:capturedRecords.get(id);
    if(!record||id==='concert'&&editorMode==='denied')return send(404,{code:'not_found'});
    let photos=recordPhotos.get(id)??[];const data=()=>({record:id==='concert'?editorRecord:capturedRecords.get(id),photos});
    if(req.method==='GET'){if(suffix?.endsWith('/image')){if(!photos.some(p=>p.id===suffix.split('/')[0]))return send(404,{code:'not_found'});res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','private, no-store');return res.end(imageBytes);}return send(200,{data:data()});}
    const expected=Number(url.searchParams.get('expectedRevision')??body.expectedRevision);const key=id+':'+req.headers['idempotency-key'];const replay=photoIntents.get(key);
    if(req.method==='POST')photoUploads++;
    if(req.method==='POST'&&replay)return send(200,{data:data(),meta:{photoID:replay,replay:true}});
    if(expected!==record.revision)return send(409,{code:'conflict'});
    let photoID;
    if(req.method==='POST'){assert.deepEqual(rawBytes,imageBytes);photoID=`photo-${photoIntents.size+1}`;photoIntents.set(key,photoID);photos=[...photos,{id:photoID,altText:''}];}
    else if(req.method==='PUT'&&suffix==='order'){assert.deepEqual([...body.ids].sort(),photos.map(p=>p.id).sort());photos=body.ids.map(id=>photos.find(p=>p.id===id));}
    else if(req.method==='PATCH')photos=photos.map(p=>p.id===suffix?{...p,altText:body.altText}:p);
    else if(req.method==='DELETE')photos=photos.filter(p=>p.id!==suffix);
    else return send(400,{code:'invalid_photo'});
    const updated={...record,revision:record.revision+1};if(id==='concert')editorRecord=updated;else capturedRecords.set(id,updated);recordPhotos.set(id,photos);
    if(req.method==='POST'&&losePhoto){losePhoto=false;return send(503,{code:'unavailable'});}
    return send(200,{data:data(),...(photoID?{meta:{photoID,replay:false}}:{})});
  }
  if (url.pathname.startsWith('/v1/dealers/created-shop/inventory/captured-')) {
    const id = url.pathname.split('/').at(-1);const record = capturedRecords.get(id);
    if (!record) return send(404, { code: 'not_found' });
    if (req.method === 'PUT') {
      if (body.expectedRevision !== record.revision) return send(409, { code: 'conflict' });
      capturedRecords.set(id, { ...record, revision: record.revision + 1, attributes: body.attributes });
    }
    return send(200, { data: capturedRecords.get(id) });
  }
  if (url.pathname === '/v1/dealers/created-shop/inventory/concert') {
    if (editorMode === 'denied') return send(404, { code: 'not_found' });
    if (req.method === 'PUT') {
      editorWrites++;editorVoiceFields=[...(body.voiceFields??[])];
      if (body.expectedRevision !== editorRecord.revision) return send(409, { code: 'conflict' });
      editorRecord = { ...editorRecord, revision: editorRecord.revision + 1, attributes: body.attributes };
      // Model a gateway losing the upstream acknowledgement after a commit.
      if (editorMode === 'lose') { editorMode = 'normal'; return send(503, { code: 'unavailable' }); }
    }
    return send(200, { data: editorRecord });
  }
  if (url.pathname === '/v1/dealers/created-shop/inventory') {
    if (inventoryMode !== 'normal') return send(inventoryMode === 'denied' ? 404 : 503, { code: inventoryMode === 'denied' ? 'not_found' : 'unavailable' });
    if (req.method === 'POST') {
      captureCreates++;const key = req.headers['idempotency-key'];assert.ok(typeof key === 'string' && key.length >= 16);
      if (!captureIntents.has(key)) {
        const id = `captured-${captureIntents.size + 1}`;captureIntents.set(key, id);
        capturedRecords.set(id, { id, dealer_id: 'created-shop', revision: 1, status: 'draft', attributes: { stock_number: `PT-${id}` }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' });
      }
      if (loseCapture) { loseCapture = false; return send(503, { code: 'unavailable' }); }
      return send(201, { data: capturedRecords.get(captureIntents.get(key)) });
    }
    const records = [
      { id: 'concert', title: 'Concert Grand', status: 'available', featured: true },
      { id: 'baby', title: 'Baby Grand', status: 'draft', featured: false },
      { id: 'upright', title: 'Studio Upright', status: 'sold', featured: false },
      ...[...capturedRecords.values()].map(r => ({ id: r.id, title: r.attributes.title || r.attributes.stock_number, status: r.status, featured: !!r.attributes.featured })),
    ].filter(item => (url.searchParams.get('status') ? item.status === url.searchParams.get('status') : url.searchParams.get('includeInactive') === 'true' || item.status !== 'sold') && item.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()));
    const offset = Number(url.searchParams.get('cursor') || 0);
    return send(200, { data: records.slice(offset, offset + 1).map(item => capturedRecords.get(item.id) || ({ id: item.id, dealer_id: 'created-shop', revision: 1, status: item.status, attributes: { stock_number: item.id, title: item.title, featured: item.featured }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' })), meta: offset + 1 < records.length ? { nextCursor: String(offset + 1) } : {} });
  }
  if (url.pathname === '/v1/dealers' && req.method === 'POST') {
    createRequests++;
    const key = req.headers['idempotency-key'];
    if (!creations.has(key)) { const shop = { ...body, id: 'created-shop', revision: 1 }; creations.set(key, { raw, shop }); shops.set(shop.id, shop); }
    assert.equal(creations.get(key).raw, raw);
    if (createRequests === 1) return send(503, { code: 'unavailable' });
    return send(201, { data: creations.get(key).shop });
  }
  if (url.pathname.includes('/staff-invitations/external-invite/')) {
    if (body.token !== joinToken || invitationAccepted) return send(400, { code: 'invalid_invitation' });
    if (url.pathname.endsWith('/preview')) return send(200, { data: { id: 'external-invite', dealerID: 'invited-shop', dealerName: 'Invited Pianos', role: 'viewer', expiresAt: '2030-01-01T00:00:00Z' } });
    invitationAccepted = true;
    shops.set('invited-shop', { ...shops.get('studio'), id: 'invited-shop', name: 'Invited Pianos' });
    return send(200, { data: { dealerID: 'invited-shop', userID: 'test-owner', active: true, grantPending: true } });
  }
  if (url.pathname === '/v1/dealers/invited-shop' && invitationAccepted && ++accessChecks === 1) return send(404, { code: 'not_found' });
  if (url.pathname.includes('/staff') && denyStaff) return send(404, { code: 'not_found' });
  if (url.pathname.includes('/staff-invitations')) {
    if (req.method === 'GET') return send(200, { data: [...staffInvitations.values()], meta: {} });
    if (url.pathname.endsWith('/revoke')) { const id = url.pathname.split('/').at(-2); staffInvitations.get(id).revokedAt = new Date().toISOString(); res.writeHead(204).end(); return; }
    const issued = { id: 'staff-invitation', dealerID: 'created-shop', dealerName: 'My edited shop', role: body.role, expiresAt: '2030-01-01T00:00:00Z', token: 'one-time-test-secret' };
    const { token, ...summary } = issued; staffInvitations.set(issued.id, summary); return send(201, { data: issued });
  }
  if (url.pathname.includes('/staff')) {
    if (req.method === 'GET') return send(200, { data: [...members.values()], meta: {} });
    const id = url.pathname.split('/').at(-2); const member = members.get(id);
    if (staffConflict) { staffConflict = false; member.revision++; return send(409, { code: 'conflict' }); }
    if (body.expectedRevision !== member.revision) return send(409, { code: 'conflict' });
    member.revision++; if (url.pathname.endsWith('/revoke')) member.active = false; else { member.role = body.role; member.grantPending = true; }
    return send(200, { data: member });
  }
  if (req.method === 'PUT') {
    const shop = shops.get(url.pathname.split('/').at(-1));
    if (conflictOnce) { conflictOnce = false; shop.revision++; shop.name = 'Concurrent shop'; }
    if (body.expectedRevision !== shop.revision) return send(409, { code: 'conflict' });
    const updated = { ...body, id: shop.id, revision: shop.revision + 1 }; shops.set(shop.id, updated); return send(200, { data: updated });
  }
  if (url.pathname === '/v1/session/refresh') {
    if (refreshMode === 'failure') return send(503, { code: 'unavailable' });
    if (refreshMode === 'recover') { const token = `rotated-${++rotations}`; sessions.add(token); return send(200, { data: { token, expiresAt: new Date(Date.now() + (rotations + 2) * 3600000).toISOString() } }); }
    refreshRequested(); await heldRefresh; return send(200, { data: { token: 'late-replacement', expiresAt: new Date(Date.now() + 3600000).toISOString() } }); }
  if (url.pathname === '/v1/me') return send(200, { data: { id: 'test-owner', email: 'owner@example.com', displayName: 'Owner' } });
  if (url.pathname === '/v1/session' && req.method === 'DELETE') { res.writeHead(204).end(); return; }
  if (url.pathname === '/v1/dealers' && !url.searchParams.has('cursor') && ++firstPageReads === 2) return send(503, { code: 'unavailable' });
  if (url.pathname === '/v1/dealers') return send(200, url.searchParams.has('cursor') ? { data: [...shops.values()], meta: {} } : { data: [], meta: { nextCursor: 'authorized-next-page' } });
  const id = url.pathname.split('/').at(-1);
  if (id === 'atelier') { detailRequested(); await held; }
  const shop = shops.get(id);
  return send(shop ? 200 : 404, shop ? { data: shop } : { code: 'not_found' });
});
server.listen(Number(process.env.DEALER_ACCEPTANCE_API_PORT??8089), '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({channel:'chromium',headless:true,args:['--use-fake-device-for-media-stream']});
let evidencePage;
try {
  const context = await browser.newContext({locale:'es-ES',permissions:['microphone']});
  await context.addInitScript(() => window.sessionStorage.setItem('pianotechpros_application_session', JSON.stringify({ token: 'browser-test-session', expiresAt: new Date(Date.now() + 3600000).toISOString() })));
  await context.addInitScript(()=>{
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.photoURLs=new Set();
    URL.createObjectURL=value=>{const url=create(value);window.photoURLs.add(url);return url;};URL.revokeObjectURL=url=>{window.photoURLs.delete(url);revoke(url);};
  });
  const page = await context.newPage();evidencePage=page;
  page.setDefaultTimeout(15000);
  await page.clock.install();
  const initialResponse=await page.goto(webURL);assert.match(initialResponse.headers()['content-security-policy'],/img-src 'self' blob:/);
  assert.equal(initialResponse.headers()['permissions-policy'],'camera=(), microphone=(self), geolocation=()');
  await page.getByRole('heading', { name: 'Tus tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Actualizar tiendas', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  assert.equal(firstPageReads, 3);
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).click();
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('New shop');
  await page.getByLabel('Nombre de la dirección de la sala de exposición', { exact: true }).fill('new-shop');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('new@example.com');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-profile-form-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Crear tienda', exact: true }).last().click();
  await page.getByText('El resultado no está confirmado. Reintenta este envío antes de cambiar el formulario.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).isDisabled(), true);
  const untilRefresh = await page.evaluate(() => Date.parse(JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).expiresAt) - Date.now() - 5 * 60000);
  await page.clock.fastForward(untilRefresh + 1000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'New shop');
  refreshMode = 'recover';
  await page.clock.fastForward(30000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByRole('heading', { name: 'New shop', exact: true }).waitFor();
  assert.equal(creations.size, 1); assert.equal(createRequests, 2);
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('My edited shop');
  refreshMode = 'failure';
  const nextRefresh = await page.evaluate(() => Date.parse(JSON.parse(sessionStorage.getItem('pianotechpros_application_session')).expiresAt) - Date.now() - 5 * 60000);
  await page.clock.fastForward(nextRefresh + 1000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'My edited shop');
  refreshMode = 'recover';
  await page.clock.fastForward(30000);
  await page.getByText('Sesión iniciada. El servicio no está disponible temporalmente.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar perfil actual', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'My edited shop');
  await page.getByRole('button', { name: 'Revisar perfil actual', exact: true }).click();
  await page.getByText('Concurrent shop', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Conservar mis cambios sobre este perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('heading', { name: 'My edited shop', exact: true }).waitFor();
  assert.equal(shops.get('created-shop').revision, 3);
  await page.getByRole('button',{name:'Consultas de compradores',exact:true}).click();await page.getByRole('button',{name:/Synthetic buyer/}).waitFor();await page.getByRole('button',{name:/Synthetic buyer/}).click();await page.getByText('Could I visit on Saturday?',{exact:true}).waitFor();assert.equal(inquiryWrites,0);
  await page.getByRole('button',{name:'Marcar como leída',exact:true}).click();await page.getByText(/Primera lectura el/).waitFor();assert.equal(inquiryWrites,1);assert.equal(await page.getByText('Historical grand',{exact:true}).count(),2);assert.equal(await page.getByRole('link',{name:'Enviar correo al comprador',exact:true}).getAttribute('href'),'mailto:buyer%40example.com');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/piano-inbox-mobile.png',fullPage:true});
  inquiryDenied=true;await page.getByRole('button',{name:'Actualizar consultas',exact:true}).click();await page.getByText('Ya no tienes acceso a estas consultas. Vuelve al vendedor para comprobar tu acceso.',{exact:true}).waitFor();assert.equal(await page.getByText('Could I visit on Saturday?',{exact:true}).count(),0);assert.equal(await page.getByText('buyer@example.com',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Volver al vendedor',exact:true}).click();await page.setViewportSize({width:1280,height:900});

  await page.getByRole('button', { name: 'Ver inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cargar más pianos', exact: true }).click();
  await page.getByRole('heading', { name: 'Baby Grand', exact: true }).waitFor();
  await page.getByLabel('Estado', { exact: true }).selectOption('sold');
  await page.getByRole('heading', { name: 'Studio Upright', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 0);
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('absent');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByText('Ningún piano coincide con estos filtros.', { exact: true }).waitFor();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('');
  await page.getByLabel('Estado', { exact: true }).selectOption('active');
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-inventory-narrow.png', fullPage: true });
  inventoryMode = 'outage';
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click();
  await page.getByText('No se pudo cargar el inventario. Inténtalo de nuevo.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 1);
  inventoryMode = 'normal';
  await page.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await page.getByText('No se pudo cargar el inventario. Inténtalo de nuevo.', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Concert Grand', exact: true }).click();
  await page.getByLabel('Marca', { exact: true }).waitFor();
  const voicePanel=page.getByRole('region',{name:'Notas de voz'});
  await voicePanel.getByLabel('Transcripción',{exact:true}).fill('Steinway Model B');
  const beforeVoice=editorWrites;
  await voicePanel.getByRole('button',{name:'Revisar sugerencias',exact:true}).click();
  await voicePanel.getByText('Elige los campos que quieres aplicar.',{exact:true}).waitFor();
  assert.equal(editorWrites,beforeVoice);
  assert.equal(await voicePanel.getByRole('button',{name:'Aplicar campos seleccionados',exact:true}).isDisabled(),true);
  await voicePanel.getByRole('checkbox',{name:'Aplicar Marca',exact:true}).check();
  await page.getByLabel('Marca',{exact:true}).fill('Manual correction');
  await voicePanel.getByRole('button',{name:'Aplicar campos seleccionados',exact:true}).click();
  await voicePanel.getByText('Los campos cambiaron. Revisa los valores actuales antes de aplicar.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Marca',{exact:true}).inputValue(),'Manual correction');
  await voicePanel.getByRole('button',{name:'Revisar valores actuales',exact:true}).click();
  await voicePanel.getByRole('checkbox',{name:'Aplicar Marca',exact:true}).check();
  await voicePanel.getByRole('button',{name:'Aplicar campos seleccionados',exact:true}).click();
  await page.getByText('Guardado',{exact:true}).waitFor();
  assert.equal(editorRecord.attributes.make,'Steinway');assert.equal(editorRecord.attributes.model,'');assert.deepEqual(editorVoiceFields,['make']);
  await voicePanel.getByRole('button',{name:'Deshacer sugerencias',exact:true}).click();
  await page.getByText('Guardado',{exact:true}).waitFor();
  assert.equal(editorRecord.attributes.make,'Manual correction');assert.deepEqual(editorVoiceFields,[]);
  voiceMode='failure';await voicePanel.getByLabel('Transcripción',{exact:true}).fill('Steinway Model B');
  await voicePanel.getByRole('button',{name:'Revisar sugerencias',exact:true}).click();
  await voicePanel.getByText('El servicio de voz no está disponible. Puedes volver a intentarlo.',{exact:true}).waitFor();
  assert.equal(await voicePanel.getByLabel('Transcripción',{exact:true}).inputValue(),'Steinway Model B');
  voiceMode='normal';await voicePanel.getByRole('button',{name:'Revisar sugerencias',exact:true}).click();
  await voicePanel.getByText('Elige los campos que quieres aplicar.',{exact:true}).waitFor();
  await voicePanel.getByRole('button',{name:'Cancelar voz',exact:true}).click();
  await page.getByText('Guardado',{exact:true}).waitFor();assert.equal(editorRecord.attributes.make,'Manual correction');assert.deepEqual(editorVoiceFields,[]);
  assert.equal(await voicePanel.getByLabel('Transcripción',{exact:true}).inputValue(),'');
  assert.equal(voiceCalls,3);
  await voicePanel.getByRole('button',{name:'Grabar nota de voz',exact:true}).click();
  await voicePanel.getByRole('button',{name:'Detener y revisar',exact:true}).waitFor();
  await voicePanel.getByRole('meter',{name:'Nivel de entrada del micrófono',exact:true}).waitFor();
  await page.getByLabel('Marca',{exact:true}).fill('Recording correction');
  await page.getByText('Guardado',{exact:true}).waitFor();assert.equal(editorRecord.attributes.make,'Recording correction');
  assert.equal(await page.getByText('La revisión de voz está abierta. Los cambios se protegen en este dispositivo; el guardado en el servidor está en pausa.',{exact:true}).count(),0);
  await new Promise(resolve=>setTimeout(resolve,350));
  await voicePanel.getByRole('button',{name:'Detener y revisar',exact:true}).click();
  await voicePanel.getByText('Elige los campos que quieres aplicar.',{exact:true}).waitFor();
  assert.equal(audioCalls,1);assert.equal(voiceCalls,4);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await voicePanel.screenshot({path:'/tmp/piano-voice-review-mobile.png'});
  await voicePanel.getByRole('button',{name:'Editar transcripción',exact:true}).click();
  await voicePanel.getByLabel('Transcripción',{exact:true}).waitFor();
  assert.equal(await voicePanel.getByLabel('Transcripción',{exact:true}).inputValue(),'Steinway Model B');
  await voicePanel.getByRole('button',{name:'Revisar sugerencias',exact:true}).click();
  await voicePanel.getByText('Elige los campos que quieres aplicar.',{exact:true}).waitFor();
  assert.equal(voiceCalls,5);
  await voicePanel.getByRole('button',{name:'Cancelar voz',exact:true}).click();
  await page.getByText('Guardado',{exact:true}).waitFor();
  await page.setViewportSize({width:1280,height:900});

  await page.getByLabel('Marca', { exact: true }).fill('Yamaha');
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,34');
  await page.getByLabel('Año', { exact: true }).fill('1920');
  await page.getByLabel('Mes', { exact: true }).fill('2');
  await page.getByLabel('Día', { exact: true }).fill('29');
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.asking_price.minor_units, 1234);
  assert.deepEqual(editorRecord.attributes.manufactured, { year: 1920, month: 2, day: 29 });
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,');
  await page.getByText('Revisa los campos indicados. Lo escrito se conserva en este dispositivo.', { exact: true }).waitFor();
  const writesBeforeRecovery = editorWrites;
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Concert Grand', exact: true }).click();
  await page.getByText('Los cambios recuperados están listos para revisar. El guardado está en pausa hasta que continúes.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Precio de venta', { exact: true }).inputValue(), '12,');
  assert.equal(editorWrites, writesBeforeRecovery);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-editor-narrow.png', fullPage: true });
  editorMode = 'lose';
  await page.getByLabel('Precio de venta', { exact: true }).fill('12,50');
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('No se pudo confirmar el último guardado. Comprueba su estado antes de continuar.', { exact: true }).waitFor();
  const afterLost = editorWrites;
  await page.getByRole('button', { name: 'Consultar versión actual', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorWrites, afterLost);
  assert.equal(editorRecord.attributes.asking_price.minor_units, 1250);
  editorRecord = { ...editorRecord, revision: editorRecord.revision + 1, attributes: { ...editorRecord.attributes, make: 'Other editor' } };
  await page.getByLabel('Marca', { exact: true }).fill('My choice');
  await page.getByText('Este piano cambió en otro lugar. Revisa ambas versiones antes de elegir.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Consultar versión actual', exact: true }).click();
  await page.getByText('Other editor', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Conservar mis cambios', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.make, 'My choice');
  const beforeStorageFailure = editorWrites;
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restoreRecoveryWrites = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new Error('controlled storage outage'); return original.apply(this, args); };
  });
  await page.getByLabel('Modelo', { exact: true }).fill('Protected retry');
  await page.getByText('No se pudieron proteger los cambios en este dispositivo. Reintenta antes de salir.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  assert.equal(await page.getByLabel('Modelo', { exact: true }).inputValue(), 'Protected retry');
  assert.equal(editorWrites, beforeStorageFailure);
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  await page.evaluate(() => { window.restoreRecoveryWrites(); delete window.restoreRecoveryWrites; });
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(editorRecord.attributes.model, 'Protected retry');
  await page.getByText('Datos internos', { exact: true }).click();
  await page.getByLabel('Número de inventario', { exact: true }).fill('');
  await page.getByText('Datos internos', { exact: true }).click();
  await page.getByRole('link', { name: 'Número de inventario: Revisa este valor.', exact: true }).click();
  assert.equal(await page.getByLabel('Número de inventario', { exact: true }).evaluate(element => element === document.activeElement), true);
  await page.getByLabel('Número de inventario', { exact: true }).fill('concert');
  await page.getByText('Guardado', { exact: true }).waitFor();
  editorMode = 'denied';
  await page.getByLabel('Marca', { exact: true }).fill('Denied change');
  await page.getByText('Ya no tienes acceso a este inventario.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Marca', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await page.getByText('Añade una foto o datos para iniciar un borrador privado. El número de inventario se asigna automáticamente.', { exact: true }).waitFor();
  assert.equal(captureCreates, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-new-narrow.png', fullPage: true });
  await page.getByLabel('Título visible', { exact: true }).fill('New capture');
  await page.getByText('No se pudo confirmar el último guardado. Comprueba su estado antes de continuar.', { exact: true }).waitFor();
  assert.equal(capturedRecords.size, 1);
  const secondTab = await context.newPage();secondTab.setDefaultTimeout(15000);
  await secondTab.goto(webURL);
  await secondTab.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  await secondTab.getByRole('button', { name: 'My edited shop', exact: true }).click();
  await secondTab.getByRole('button', { name: 'Ver inventario', exact: true }).click();
  await secondTab.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await secondTab.getByText('Ya hay un piano nuevo abierto en otra ventana. Continúa allí o ciérrala y vuelve a intentarlo.', { exact: true }).waitFor();
  assert.equal(await secondTab.getByLabel('Título visible', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo piano', exact: true }).click();
  await page.getByText('Los cambios recuperados están listos para revisar. El guardado está en pausa hasta que continúes.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Título visible', { exact: true }).inputValue(), 'New capture');
  assert.equal(captureCreates, 1);
  await page.getByLabel('Marca', { exact: true }).fill('Kawai');
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(captureCreates, 2);assert.equal(captureIntents.size, 1);
  assert.equal(capturedRecords.get('captured-1').attributes.make, 'Kawai');
  assert.equal(capturedRecords.get('captured-1').attributes.stock_number, 'PT-captured-1');
  await secondTab.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await secondTab.getByText('Añade una foto o datos para iniciar un borrador privado. El número de inventario se asigna automáticamente.', { exact: true }).waitFor();
  assert.equal(await secondTab.getByLabel('Título visible', { exact: true }).inputValue(), '');
  await secondTab.close();
  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('New capture');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByRole('button', { name: 'New capture', exact: true }).click();
  await page.getByText('Guardado', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Marca', { exact: true }).inputValue(), 'Kawai');
  imageBytes=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;const ctx=canvas.getContext('2d');ctx.fillStyle='#285b43';ctx.fillRect(0,0,80,60);return canvas.toDataURL('image/jpeg').split(',')[1];}),'base64');
  const chosen={name:'private-source.jpg',mimeType:'image/jpeg',buffer:imageBytes};
  await page.getByLabel('Precio de venta',{exact:true}).fill('12,');
  await page.getByLabel('Elegir una foto',{exact:true}).setInputFiles(chosen);
  await page.getByRole('button',{name:'Ver foto 1',exact:true}).waitFor();
  await page.getByRole('button',{name:'Actualizar fotos',exact:true}).waitFor();
  await page.getByRole('button',{name:'Ver foto 1',exact:true}).click();
  await page.getByLabel('Describe esta foto',{exact:true}).fill('Teclado del piano');
  await page.getByRole('button',{name:'Guardar descripción',exact:true}).click();
  await page.getByRole('dialog').getByRole('img',{name:'Teclado del piano',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('dialog[open] img')?.naturalWidth===80);
  assert.equal(await page.locator('dialog[open] img').evaluate(image=>image.src.startsWith('blob:')),true);
  await page.getByRole('button',{name:'Cerrar vista previa',exact:true}).click();
  assert.equal(await page.getByLabel('Precio de venta',{exact:true}).inputValue(),'12,');
  losePhoto=true;await page.getByLabel('Elegir una foto',{exact:true}).setInputFiles(chosen);
  await page.getByText('La carga puede haberse completado. Reintenta para confirmarla sin duplicarla; no vuelvas a elegir la foto.',{exact:true}).waitFor();
  assert.equal(photoUploads,2);
  await page.getByRole('button',{name:'Volver al inventario',exact:true}).click();
  await page.getByRole('button',{name:'New capture',exact:true}).click();
  await page.getByRole('button',{name:'Reintentar carga',exact:true}).waitFor();assert.equal(photoUploads,2);
  await page.getByRole('button',{name:'Reintentar carga',exact:true}).click();
  await page.getByRole('heading',{name:'Cargas pendientes',exact:true}).waitFor({state:'detached'});
  assert.equal(photoUploads,3);assert.equal(recordPhotos.get('captured-1').length,2);
  // A removed upload entry precedes the final gallery reload; inject the remote
  // reorder only after that interaction is ready, so this tests a real conflict.
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(button=>button.textContent==='Usar como portada')[1]?.disabled===false);
  const currentRecord=capturedRecords.get('captured-1');recordPhotos.set('captured-1',[...recordPhotos.get('captured-1')].reverse());capturedRecords.set('captured-1',{...currentRecord,revision:currentRecord.revision+1});
  await page.getByRole('button',{name:'Usar como portada',exact:true}).nth(1).click();
  await page.getByText('Las fotos cambiaron en otro lugar. Revisa la galería actualizada antes de repetir el cambio.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Usar como portada',exact:true}).nth(1).click();
  await page.getByText('Las fotos cambiaron en otro lugar. Revisa la galería actualizada antes de repetir el cambio.',{exact:true}).waitFor({state:'detached'});
  await page.getByRole('button',{name:'Quitar foto',exact:true}).nth(1).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(recordPhotos.get('captured-1').length,2);
  await page.getByRole('button',{name:'Quitar foto',exact:true}).nth(1).click();await page.getByRole('dialog').getByRole('button',{name:'Quitar foto',exact:true}).click();
  await page.getByRole('button',{name:'Ver foto 2',exact:true}).waitFor({state:'detached'});
  await page.getByLabel('Elegir una foto',{exact:true}).setInputFiles({name:'unsupported.heic',mimeType:'image/heic',buffer:Buffer.from('not-a-supported-image')});
  await page.getByText('Elige una foto JPEG o PNG. Tu borrador sigue guardado.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Precio de venta',{exact:true}).inputValue(),'12,');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/piano-photos-narrow.png',fullPage:true});
  await page.getByRole('heading',{name:'Publicación y disponibilidad',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Revisar publicación',exact:true}).isDisabled(),true);
  await page.getByLabel('Precio de venta',{exact:true}).fill('1200,50');
  await page.getByLabel('Tipo de piano',{exact:true}).selectOption('grand');await page.getByLabel('Estado del piano',{exact:true}).selectOption('used');
  await page.locator('summary').filter({hasText:'Datos internos'}).click();await page.getByLabel('Notas privadas',{exact:true}).fill('PRIVATE-PUBLICATION-REVIEW');
  await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();await page.getByText('Guardado',{exact:true}).waitFor();
  const previewRecord=capturedRecords.get('captured-1');capturedRecords.set('captured-1',{...previewRecord,revision:previewRecord.revision+1});recordPhotos.set('captured-1',[...recordPhotos.get('captured-1'),...Array.from({length:6},(_,i)=>({id:`review-photo-${i}`,altText:`Review ${i}`}))]);
  await page.getByRole('button',{name:'Revisar publicación',exact:true}).click();
  let review=page.getByRole('dialog',{name:'Revisar antes de confirmar',exact:true});await review.waitFor().catch(async error=>{await page.screenshot({path:'/tmp/piano-publication-failure.png',fullPage:true});console.error(await page.locator('body').innerText());throw error;});
  assert.equal(publicationCommands,0);assert.equal(await review.evaluate(element=>element.scrollTop),0);assert.equal(await review.getByRole('heading',{name:'Revisar antes de confirmar',exact:true}).evaluate(element=>element===document.activeElement),true);await review.getByRole('img').nth(5).waitFor();assert.equal(await review.getByRole('img').count(),6);await review.getByRole('button',{name:'Fotos siguientes',exact:true}).click();await review.getByRole('img').waitFor();assert.equal(await review.getByRole('img').count(),1);await review.getByRole('button',{name:'Fotos anteriores',exact:true}).click();await review.getByRole('img').nth(5).waitFor();assert.equal(await review.getByText('PRIVATE-PUBLICATION-REVIEW',{exact:true}).count(),0);await review.screenshot({path:'/tmp/piano-publication-review.png'});
  await review.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(publicationCommands,0);
  await page.getByRole('button',{name:'Revisar publicación',exact:true}).click();await review.waitFor();await page.keyboard.press('Escape');await review.waitFor({state:'hidden'});assert.equal(publicationCommands,0);
  await page.getByRole('button',{name:'Revisar publicación',exact:true}).click();
  await review.waitFor();
  const beforeConflict=capturedRecords.get('captured-1');capturedRecords.set('captured-1',{...beforeConflict,revision:beforeConflict.revision+1});
  await review.getByRole('button',{name:'Confirmar cambio',exact:true}).click();await page.getByText('El registro cambió después de revisarlo. Revisa la última versión antes de confirmar de nuevo.',{exact:true}).waitFor();assert.equal(publicationCommands,0);
  await page.getByRole('button',{name:'Revisar publicación',exact:true}).click();await review.getByRole('button',{name:'Confirmar cambio',exact:true}).click();await page.getByText('Cambio confirmado.',{exact:true}).waitFor();assert.equal(publications.get('captured-1').visible,true);
  const publishedTitle=publications.get('captured-1').snapshot.title;
  await page.getByLabel('Título visible',{exact:true}).fill('Private later title');await page.locator('summary').filter({hasText:'Nueva disponibilidad'}).click();await page.getByLabel('Nueva disponibilidad',{exact:true}).selectOption('sold');await page.getByLabel('Importe final de la venta',{exact:true}).fill('1100,25');
  await page.getByRole('button',{name:'Revisar cambio de disponibilidad',exact:true}).click();await review.getByRole('button',{name:'Confirmar cambio',exact:true}).click();await page.getByText('Cambio confirmado.',{exact:true}).waitFor();assert.equal(publications.get('captured-1').snapshot.title,publishedTitle);assert.equal(publications.get('captured-1').snapshot.status,'sold');
  losePublication=true;await page.getByRole('button',{name:'Revisar retirada',exact:true}).click();await review.getByRole('button',{name:'Confirmar cambio',exact:true}).click();await page.getByText('El resultado es incierto. Actualiza el estado antes de decidir qué hacer. Esta operación no se reintentará automáticamente.',{exact:true}).waitFor();
  const commandCount=publicationCommands;await page.getByRole('button',{name:'Actualizar estado de publicación',exact:true}).click();await page.getByText('La publicación guardada está oculta',{exact:true}).waitFor();assert.equal(publicationCommands,commandCount);
  await page.screenshot({path:'/tmp/piano-publication-narrow.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

  await page.getByRole('button', { name: 'Volver al inventario', exact: true }).click();
  await page.getByLabel('Buscar por número, título, marca o modelo', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Buscar inventario', exact: true }).click();
  await page.getByRole('heading', { name: 'Concert Grand', exact: true }).waitFor();
  loseCapture=true;const beforePhotoCapture=captureCreates;
  await page.getByRole('button',{name:'Nuevo piano',exact:true}).click();
  await page.getByLabel('Elegir una foto',{exact:true}).setInputFiles(chosen);
  await page.getByRole('button',{name:'Reintentar carga',exact:true}).waitFor();assert.equal(captureCreates,beforePhotoCapture+1);
  await page.getByRole('button',{name:'Volver al inventario',exact:true}).click();await page.getByRole('button',{name:'Nuevo piano',exact:true}).click();
  await page.getByRole('button',{name:'Reintentar carga',exact:true}).waitFor();assert.equal(captureCreates,beforePhotoCapture+1);
  await page.getByRole('button',{name:'Reintentar carga',exact:true}).click();await page.getByRole('button',{name:'Ver foto 1',exact:true}).waitFor();
  assert.equal(captureCreates,beforePhotoCapture+2);assert.equal(capturedRecords.size,2);assert.equal(recordPhotos.get('captured-2').length,1);
  await page.getByRole('button',{name:'Volver al inventario',exact:true}).click();
  await page.waitForFunction(()=>window.photoURLs.size===0);
  inventoryMode = 'denied';
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click();
  await page.getByText('Ya no tienes acceso a este inventario.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Concert Grand', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver a la tienda', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Administrar personal', exact: true }).click();
  await page.getByText('test-owner', { exact: true }).waitFor();
  assert.equal(await page.locator('article').filter({ hasText: 'test-owner' }).getByRole('button').count(), 0);
  await page.getByRole('button', { name: 'Cambiar a lector', exact: true }).click();
  await page.getByText('El acceso cambió en otro lugar. Actualiza y revisa antes de hacer otro cambio.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar a lector', exact: true }).click();
  await page.getByText(/Actualización de acceso pendiente/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-staff-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Eliminar acceso', exact: true }).click();
  assert.equal(members.get('test-editor').active, true);
  await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await page.getByText(/Eliminado/).waitFor();
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click();
  const code = page.getByLabel('Código de invitación de un solo uso', { exact: true });
  await code.waitFor();
  assert.equal(JSON.parse(await code.inputValue()).token, 'one-time-test-secret');
  assert.ok(!page.url().includes('one-time-test-secret'));
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  assert.equal(JSON.parse(await code.inputValue()).token, 'one-time-test-secret');
  await page.getByRole('button', { name: 'Revocar invitación', exact: true }).click();
  assert.equal(staffInvitations.get('staff-invitation').revokedAt, undefined);
  await page.getByRole('button', { name: 'Confirmar revocación', exact: true }).click();
  await page.getByText(/Revocada/).waitFor();
  assert.equal(await code.count(), 0);
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click();
  await code.waitFor();
  denyStaff = true;
  await page.getByRole('button', { name: 'Actualizar personal', exact: true }).click();
  await page.getByText('La administración del personal no está disponible o no tienes permiso.', { exact: true }).waitFor();
  assert.equal(await code.count(), 0);
  assert.equal(await page.getByText('test-owner', { exact: true }).count(), 0);
  assert.equal(await page.getByText('test-editor', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al perfil', exact: true }).click();
  denyStaff = true;
  await page.getByRole('button', { name: 'Administrar personal', exact: true }).click();
  await page.getByText('La administración del personal no está disponible o no tienes permiso.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Crear invitación', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Volver al perfil', exact: true }).click();
  denyStaff = false;
  await page.getByRole('button', { name: 'Unirse a una tienda', exact: true }).click();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill('invalid-private-code');
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByText('Este código no es válido, ha caducado o ya no está disponible. Pide una nueva invitación al propietario.', { exact: true }).waitFor();
  const privateCode = JSON.stringify({ dealerID: 'invited-shop', invitationID: 'external-invite', token: joinToken });
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByRole('heading', { name: 'Invited Pianos', exact: true }).waitFor();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode + ' ');
  assert.equal(await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-join-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
  await page.getByText('Invitación aceptada.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Pega tu código de invitación', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Comprobar acceso a la tienda', exact: true }).click();
  await page.getByText('El acceso aún no está disponible. Si acabas de aceptar, espera un momento y vuelve a comprobarlo.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Comprobar acceso a la tienda', exact: true }).click();
  await page.getByRole('button', { name: 'Administrar personal', exact: true }).waitFor();
  assert.equal(accessChecks, 3);
  assert.ok(!page.url().includes(joinToken));
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert.ok(!storage.includes(joinToken));
  await page.getByRole('button', { name: 'Unirse a una tienda', exact: true }).click();
  await page.getByLabel('Pega tu código de invitación', { exact: true }).fill(privateCode);
  await page.getByRole('button', { name: 'Revisar invitación', exact: true }).click();
  await page.getByText('Este código no es válido, ha caducado o ya no está disponible. Pide una nueva invitación al propietario.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();


  await page.getByRole('button', { name: 'Cargar más tiendas', exact: true }).click();
  await page.getByRole('button', { name: 'Studio Pianos', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Studio Pianos', exact: true }).waitFor();
  assert.ok(await page.getByText('studio@example.com', { exact: true }).isVisible());
  await page.screenshot({ path: '/tmp/piano-dealer-web-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/piano-dealer-web-narrow.png', fullPage: true });
  await page.getByRole('button', { name: 'Atelier Pianos', exact: true }).click();
  await bounded(requested);
  assert.equal(await page.getByRole('heading', { name: 'Studio Pianos', exact: true }).count(), 0);
  const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/v1/dealers/atelier');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  releaseDetail();
  await (await lateResponse).finished();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tus tiendas', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('pianotechpros_application_session')), null);
  await page.screenshot({ path: '/tmp/piano-dealer-web-signed-out.png', fullPage: true });
  refreshMode = 'hold';
  await page.evaluate(async (apiURL) => {
    const auth = await import('/src/lib/auth.ts');
    sessionStorage.setItem('pianotechpros_application_session', JSON.stringify({ token: 'browser-test-session', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
    window.refreshResult = auth.refreshApplicationSession({ environment: 'development', apiURL, oidcIssuer: 'http://localhost:5556/dex', oidcClientId: 'pianotechpros-web' }).then(() => 'restored', () => 'discarded');
  }, `http://127.0.0.1:${server.address().port}`);
  await bounded(requestedRefresh);
  await page.evaluate(() => sessionStorage.removeItem('pianotechpros_application_session'));
  releaseRefresh();
  assert.equal(await page.evaluate(() => window.refreshResult), 'discarded');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('pianotechpros_application_session')), null);
  console.log('Voice recorded audio/typed transcript/review/selection/intervening edit/re-review/Undo/retry/cancel/transcript correction/recording autosave; Inquiry list/detail/explicit read/conflict reconciliation/contact actions/mobile layout/access revocation clearing; Publication review/cancellation/Escape/private-field exclusion/restored-draft protection/stale revisions/acknowledgement with concurrent revision/sale snapshot preservation/uncertain unpublish refresh; Photo-first lost-create recovery, protected upload retry, private image preview, photo ordering conflict, description and removal confirmation; lazy New capture/idempotent retry/recovery/cross-tab exclusion and inventory editing/autosave/partial-input recovery/lost-response reconciliation/conflict/denial, browsing/filter/search/pagination/retry/denial and dealer web invitation preview/acceptance/pending/replay, staff permissions/conflicts/removal/invitation revocation, creation retry, conflict review, form retention through session outages, Spanish pagination, keyboard selection, responsive layout and sign-out isolation passed');
} catch(error){if(evidencePage){await evidencePage.screenshot({path:'/tmp/piano-publication-failure.png',fullPage:true});console.error(await evidencePage.locator('body').innerText());}throw error;} finally { releaseRefresh(); releaseDetail(); await browser.close(); server.close(); }
