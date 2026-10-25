import assert from 'node:assert/strict';
import test from 'node:test';
import {createInquiryComposer,validateInquiryContact,type InquiryContactFields} from './inquiry-composer.js';
const valid:InquiryContactFields={name:' Buyer ',email:'buyer@example.com',phone:'',message:' Please arrange a visit ',preference:'email'};
test('buyer contact validation canonicalizes and identifies fields',()=>{
 const result=validateInquiryContact(valid);assert.equal(result.ok,true);if(result.ok){assert.equal(result.contact.name,'Buyer');assert.equal(result.contact.message,'Please arrange a visit');}
 for(const [field,value] of [['name',''],['email','invalid'],['email','鍵'.repeat(90)+'@example.com'],['phone','123\n456'],['message','x'.repeat(4001)],['name','\ud800'],['preference','sms']] as const){const result=validateInquiryContact({...valid,[field]:value});assert.equal(result.ok,false);if(!result.ok)assert.ok(result.errors.includes(field));}
 const phone=validateInquiryContact({...valid,preference:'phone'});assert.equal(phone.ok,false);if(!phone.ok)assert.ok(phone.errors.includes('phone'));
});
test('buyer composer preserves failed input and clears confirmed delivery',async()=>{
 let failure=true;const bodies:unknown[]=[];const composer=createInquiryComposer({submit:async(body)=>{bodies.push(body);if(failure)throw new Error('network');},classify:()=> 'network'});
 for(const [field,value] of Object.entries(valid))composer.set(field as keyof InquiryContactFields,value);
 await composer.submit('first-proof','');assert.equal(composer.state().issue,'network');assert.equal(composer.state().fields.name,valid.name);assert.equal(composer.state().delivered,false);
 failure=false;await composer.submit('second-proof','');assert.equal(composer.state().delivered,true);assert.equal(composer.state().fields.name,'');assert.equal(composer.state().issue,null);
 await composer.submit('third-proof','');assert.equal(bodies.length,2);assert.equal((bodies[1] as any).challenge,'second-proof');assert.equal((bodies[1] as any).name,'Buyer');
});
test('buyer composer serializes submissions and ignores late results after disposal',async()=>{
 let finish!:()=>void;let calls=0;let signal:AbortSignal|undefined;let changes=0;
 const composer=createInquiryComposer({submit:async(_body,s)=>{calls++;signal=s;await new Promise<void>(resolve=>{finish=resolve;});},classify:()=> 'network',changed:()=>{changes++;}});
 for(const [field,value] of Object.entries(valid))composer.set(field as keyof InquiryContactFields,value);
 const first=composer.submit('proof','');assert.equal(composer.state().busy,true);await composer.submit('proof','');assert.equal(calls,1);
 composer.dispose();const before=changes;assert.equal(signal?.aborted,true);assert.equal(composer.state().fields.email,'');finish();await first;assert.equal(changes,before);assert.equal(composer.state().delivered,false);
});
test('invalid contact never reaches delivery and snapshots cannot mutate form state',async()=>{
 let calls=0;const composer=createInquiryComposer({submit:async()=>{calls++;},classify:()=> 'unavailable'});
 const snapshot=composer.state();snapshot.fields.name='changed';await composer.submit('','');assert.equal(calls,0);assert.equal(composer.state().fields.name,'');assert.ok(composer.state().errors.includes('name'));
});

test('observer disposal before dispatch never sends private contact',async()=>{
 let calls=0;const composer=createInquiryComposer({submit:async()=>{calls++;},classify:()=> 'network',changed:()=>{if(composer.state().busy)composer.dispose();}});
 for(const [field,value] of Object.entries(valid))composer.set(field as keyof InquiryContactFields,value);
 await composer.submit('proof','');assert.equal(calls,0);assert.equal(composer.state().fields.email,'');
});
