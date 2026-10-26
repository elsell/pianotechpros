import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {verifyIOSMetro} from './ios-metro-ready.mjs';
async function fixture(run, handler) {
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {await run(`http://127.0.0.1:${server.address().port}`);} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('reads an iOS manifest and the complete bundle through real HTTP',async()=>{
 let bundle=false;const methods=[];
 await fixture(async origin=>{assert.deepEqual(await verifyIOSMetro(origin),{bundleBytes:17});assert.equal(bundle,true);assert.deepEqual(methods,['HEAD','GET','GET']);},(req,res)=>{
  methods.push(req.method);
  if(req.url==='/'){assert.equal(req.headers['expo-platform'],'ios');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({launchAsset:{url:`http://${req.headers.host}/index.bundle`}}));}
  else {bundle=true;res.setHeader('Content-Type','application/javascript');res.end('console.log("ok")');}
 });
});
test('rejects foreign bundle origins before contacting them',async()=>{
 await fixture(origin=>assert.rejects(verifyIOSMetro(origin),/same loopback origin/),(req,res)=>res.end(JSON.stringify({launchAsset:{url:'https://example.test/index.bundle'}})));
});
test('rejects HTTP failure and empty bundles',async()=>{
 for(const status of [503,200])await fixture(origin=>assert.rejects(verifyIOSMetro(origin),/bundle/),(req,res)=>{
  if(req.url==='/')res.end(JSON.stringify({launchAsset:{url:`http://${req.headers.host}/index.bundle`}}));else {res.statusCode=status;res.setHeader('Content-Type','application/javascript');res.end();}
 });
});
test('rejects manifest redirects and malformed manifests',async()=>{
 for(const redirect of [true,false])await fixture(origin=>assert.rejects(verifyIOSMetro(origin)),(req,res)=>{if(redirect){res.statusCode=302;res.setHeader('Location','/other');}res.end('not json');});
});

test('malformed manifest diagnostics never contain response content',async()=>{
 await fixture(origin=>assert.rejects(verifyIOSMetro(origin),error=>{
  assert.equal(error.message,'Metro manifest unavailable or malformed');
  assert.equal(error.message.includes('PRIVATE_SENTINEL'),false);return true;
 }),(_req,res)=>res.end('PRIVATE_SENTINEL'));
});

test('a failed launcher HEAD probe stops before manifest or bundle GET',async()=>{
 const methods=[];
 await fixture(async origin=>{await assert.rejects(verifyIOSMetro(origin),/HEAD.*503/);assert.deepEqual(methods,['HEAD']);},(req,res)=>{
  methods.push(req.method);
  if(req.method==='HEAD'){res.statusCode=503;res.end();return;}
  if(req.url==='/'){res.end(JSON.stringify({launchAsset:{url:`http://${req.headers.host}/index.bundle`}}));return;}
  res.setHeader('Content-Type','application/javascript');res.end('ok');
 });
});

test('HEAD transport failure reports its stage without request details',async()=>{
 await fixture(origin=>assert.rejects(verifyIOSMetro(origin),{message:'Metro HEAD probe request failed or timed out'}),(_req,res)=>res.destroy());
});
