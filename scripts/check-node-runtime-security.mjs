// Bounded offline regression inputs for the Node October 2026 security fixes.
// Behavior reference: https://nodejs.org/en/blog/release/v24.22.1
import assert from 'node:assert/strict';
import dns from 'node:dns';
import tls from 'node:tls';
import fs from 'node:fs';
if(process.argv.includes('--require-no-build-tools'))for(const path of ['/usr/bin/npm','/usr/bin/npx','/usr/lib/node_modules_24/npm'])assert.equal(fs.existsSync(path),false,'Build-only tooling remains: '+path);
const invalid='localhost\0.example.test';
for(const name of ['resolve','resolve4','resolve6','resolveTxt']){
 assert.throws(()=>dns[name](invalid,()=>{}),{code:'ERR_INVALID_ARG_VALUE'},name+' must reject NUL before resolution');
 await assert.rejects(async()=>dns.promises[name](invalid),{code:'ERR_INVALID_ARG_VALUE'});
}
for(const host of ['0127.0.0.1','0177.0.0.1','0x7f.0.0.1','2130706433','127.1','１２７.0.0.1']){
 for(const san of ['IP Address:87.0.0.1','IP Address:127.0.0.1','DNS:127.0.0.1']){
  const error=tls.checkServerIdentity(host,{subjectaltname:san,subject:{}});
  assert.equal(error?.code,'ERR_TLS_CERT_ALTNAME_INVALID',host+' / '+san);
  assert.equal(error.reason,'Host is a non-canonical IP address');
 }
}
assert.equal(tls.checkServerIdentity('127.0.0.1',{subjectaltname:'IP Address:127.0.0.1',subject:{}}),undefined);
assert.equal(tls.checkServerIdentity('example.test',{subjectaltname:'DNS:example.test',subject:{}}),undefined);
console.log(JSON.stringify({node:process.version,dns:'NUL rejected',tls:'non-canonical rejected; legitimate identities accepted'}));
