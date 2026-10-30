import test from 'node:test';
import assert from 'node:assert/strict';
import {createInquiryProof} from './inquiry-proof';
const url='https://piano.example.com/inquiry-verification';
const message=(token='proof')=>JSON.stringify({type:'inquiry-proof',token});
test('proof binds to the exact hosted page and consumes once',()=>{
 const proof=createInquiryProof(url);const instance=proof.restart();
 for(const source of ['https://evil.example/inquiry-verification',url+'?x=1',url+'#x',url+'/','https://user@piano.example.com/inquiry-verification'])assert.equal(proof.receive(instance,source,message()),false);
 assert.equal(proof.ready(),false);assert.equal(proof.receive(instance,url,message()),true);assert.equal(proof.ready(),true);
 assert.equal(proof.take(),'proof');assert.equal(proof.take(),'');
 assert.equal(proof.receive(instance,url,message()),false);assert.equal(proof.ready(),false);
});
test('retired widget callbacks cannot revive proof after reset or background',()=>{
 const proof=createInquiryProof(url),old=proof.restart();proof.receive(old,url,message());const current=proof.restart();
 assert.equal(proof.ready(),false);assert.equal(proof.receive(old,url,message()),false);
 assert.equal(proof.receive(current,url,message('fresh')),true);proof.clear();assert.equal(proof.take(),'');assert.equal(proof.receive(current,url,message()),false);
});
test('malformed bridge messages and expiry fail closed without retaining tokens',()=>{
 const proof=createInquiryProof(url);
 for(const data of ['{}','null','[]','not json',JSON.stringify({type:'inquiry-proof',token:123}),JSON.stringify({type:'inquiry-proof',token:'x'.repeat(2049)}),message('bad\nproof'),JSON.stringify({type:'inquiry-proof',token:'proof',contact:'private'})]){
  const instance=proof.restart();proof.receive(instance,url,message());assert.equal(proof.receive(instance,url,data),false);assert.equal(proof.ready(),false);
 }
 const instance=proof.restart();proof.receive(instance,url,message());assert.equal(proof.receive(instance,url,message('')),true);assert.equal(proof.ready(),false);
});
import {inquiryVerificationNavigation} from './inquiry-proof';
test('verification navigation never hands foreign links to a native handler',()=>{
 assert.equal(inquiryVerificationNavigation(url,url),true);
 for(const frame of ['https://challenges.cloudflare.com/turnstile/widget','about:blank','about:srcdoc']){
  assert.equal(inquiryVerificationNavigation(url,frame,false),true);assert.equal(inquiryVerificationNavigation(url,frame,true),false);assert.equal(inquiryVerificationNavigation(url,frame),false);
 }
 for(const foreign of ['file:///etc/passwd','javascript:alert(1)','intent://launch','https://challenges.cloudflare.com.evil.example/frame','https://evil.example/','http://challenges.cloudflare.com/frame',url+'/other'])assert.equal(inquiryVerificationNavigation(url,foreign,false),false);
});
import {inquiryProofCallbacks} from './inquiry-proof';
test('retired native widget messages and errors cannot invalidate a replacement',()=>{
 const proof=createInquiryProof(url);let changes=0,failures=0;
 const old=inquiryProofCallbacks(proof,proof.restart(),()=>changes++,()=>failures++);
 const current=inquiryProofCallbacks(proof,proof.restart(),()=>changes++,()=>failures++);
 current.message(url,message('fresh'));assert.equal(proof.ready(),true);
 old.message(url,message('late'));old.fail();assert.equal(proof.ready(),true);assert.equal(failures,0);assert.equal(changes,1);
 current.message(url,'malformed');assert.equal(proof.ready(),false);assert.equal(failures,1);
 const next=inquiryProofCallbacks(proof,proof.restart(),()=>changes++,()=>failures++);next.message(url,message());proof.clear();next.fail();assert.equal(failures,1);
});
