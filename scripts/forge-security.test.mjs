import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';

const mobile=createRequire(new URL('../apps/mobile/package.json',import.meta.url));
const expo=createRequire(mobile.resolve('expo/package.json'));
const cli=createRequire(expo.resolve('@expo/cli/package.json'));
const tooling=createRequire(new URL('../tools/eas-cli/package.json',import.meta.url));
const eas=createRequire(tooling.resolve('eas-cli/package.json'));
const consumers=[['Expo CLI',cli],['EAS CLI',eas],
 ['Expo code signing',createRequire(cli.resolve('@expo/code-signing-certificates'))],
 ['EAS code signing',createRequire(eas.resolve('@expo/code-signing-certificates'))],
 ['EAS PKCS12',createRequire(eas.resolve('@expo/pkcs12'))],
 ['EAS Java keystore',createRequire(eas.resolve('jks-js'))]];
const key=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:3});
const other=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:3});
for(const [name,consumer] of consumers) {
 const forge=consumer('node-forge');
 const privateKey=forge.pki.privateKeyFromPem(key.privateKey.export({type:'pkcs1',format:'pem'}));
 const publicKey=forge.pki.publicKeyFromPem(key.publicKey.export({type:'pkcs1',format:'pem'}));
 const otherKey=forge.pki.privateKeyFromPem(other.privateKey.export({type:'pkcs1',format:'pem'}));
 const digest=()=>forge.md.sha256.create().update('synthetic piano signing fixture');
 const a=forge.asn1; const u=a.Class.UNIVERSAL; const t=a.Type;
 const der=(withNull,extra)=>a.toDer(a.create(u,t.SEQUENCE,true,[
   a.create(u,t.SEQUENCE,true,[a.create(u,t.OID,false,a.oidToDer(forge.pki.oids.sha256).getBytes()),
     ...(withNull?[a.create(u,t.NULL,false,'')]:[]),...extra]),
   a.create(u,t.OCTETSTRING,false,digest().digest().getBytes()),
 ])).getBytes();
 test(`${name} accepts legitimate signatures and rejects changed message or signer`,()=>{
   const signature=privateKey.sign(digest());
   assert.equal(publicKey.verify(digest().digest().getBytes(),signature),true);
   assert.equal(publicKey.verify(forge.md.sha256.create().update('changed').digest().getBytes(),signature),false);
   let accepted=false;
   try { accepted=publicKey.verify(digest().digest().getBytes(),otherKey.sign(digest())); } catch { /* Invalid RSA padding also rejects a different signer. */ }
   assert.notEqual(accepted,true);
 });
 test(`${name} preserves optional NULL digest parameters`,()=>{
   for(const withNull of [false,true])assert.equal(publicKey.verify(digest().digest().getBytes(),privateKey.sign(der(withNull,[]),'NONE')),true);
 });
 test(`${name} rejects non-canonical BER DigestInfo lengths`,()=>{
   const canonical=der(true,[]);
   const malformed=[
     '\x30\x81'+canonical.slice(1), // Non-minimal outer length.
     '\x30\x80'+canonical.slice(2)+'\x00\x00', // Indefinite outer length.
   ];
   for(const encoded of malformed) {
     const signature=privateKey.sign(encoded,'NONE');
     assert.throws(()=>publicKey.verify(digest().digest().getBytes(),signature),/DigestInfo/);
   }
 });
 test(`${name} rejects extra nested digest-algorithm children`,()=>{
   for(const withNull of [false,true])for(const extra of [a.create(u,t.OCTETSTRING,false,'garbage'),a.create(u,t.NULL,false,'')]) {
     if(!withNull&&extra.type===t.NULL)continue; // One NULL is a legitimate parameter.
     const malformed=privateKey.sign(der(withNull,[extra]),'NONE');
     assert.throws(()=>publicKey.verify(digest().digest().getBytes(),malformed),/DigestInfo/);
   }
 });
}

test('all signing consumers use the reviewed upstream release and installed sources',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../patches/node-forge.json',import.meta.url)));
 const sha=data=>createHash('sha256').update(data).digest('hex');
 for(const [,consumer] of consumers) {
  const root=dirname(consumer.resolve('node-forge/package.json'));
  assert.equal(JSON.parse(readFileSync(join(root,'package.json'))).version,manifest.version);
  for(const [file,expected] of Object.entries(manifest.files))assert.equal(sha(readFileSync(join(root,file))),expected,file);
 }
});

for(const [name,consumer] of [['Expo',cli],['EAS',eas]])test(`${name} code signing certificate and buffer verification remain functional`,()=>{
 const signing=consumer('@expo/code-signing-certificates');
 const keys=signing.convertKeyPairPEMToKeyPair({privateKeyPEM:key.privateKey.export({type:'pkcs1',format:'pem'}),publicKeyPEM:key.publicKey.export({type:'pkcs1',format:'pem'})});
 const certificate=signing.generateSelfSignedCodeSigningCertificate({keyPair:keys,validityNotBefore:new Date('2026-01-01T00:00:00Z'),validityNotAfter:new Date('2027-01-01T00:00:00Z'),commonName:'synthetic signing fixture'});
 assert.equal(certificate.verify(certificate),true);
 const signature=signing.signBufferRSASHA256AndVerify(keys.privateKey,certificate,Buffer.from('fixture'));
 assert.ok(Buffer.from(signature,'base64').length===256);
});
