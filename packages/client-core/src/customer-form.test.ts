import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCustomerForm,customerFormIssues,customerAttributes,customerFormFromAttributes,addCustomerLocation,addCustomerPiano,removeCustomerLocation,removeCustomerPiano,reassignCustomerPiano} from './customer-form.js';
const zones=new Set(['UTC','CET']);
const valid=()=>{const f=emptyCustomerForm();f.name='Ada';f.email='ada@example.test';f.locations.push({key:'home',label:'Home',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC',notes:''});return f;};
test('customer form validates ordered fields without discarding incomplete year text',()=>{
 const f=valid();assert.deepEqual(customerFormIssues(f,zones),[]);
 const withPiano=addCustomerPiano(f,'home',()=> 'piano')!;withPiano.pianos[0]!.nickname='Studio';withPiano.pianos[0]!.form='grand';withPiano.pianos[0]!.manufacturedYear='19x';
 assert.deepEqual(customerFormIssues(withPiano,zones),[{path:'pianos.piano.manufacturedYear',code:'invalid'}]);assert.equal(withPiano.pianos[0]!.manufacturedYear,'19x');assert.throws(()=>customerAttributes(withPiano,zones));
 withPiano.pianos[0]!.manufacturedYear='';assert.equal(customerAttributes(withPiano,zones).pianos[0]!.manufacturedYear,null);
 withPiano.pianos[0]!.manufacturedYear='1924';const wire=customerAttributes(withPiano,zones);assert.equal(wire.pianos[0]!.manufacturedYear,1924);assert.deepEqual(customerFormFromAttributes(wire),withPiano);
 const bad=valid();bad.name='x'.repeat(201);bad.isBusiness=true;bad.email='Name <a@example.test>';bad.locations[0]!.timezone='Local';assert.deepEqual(customerFormIssues(bad,zones).map(i=>i.path),['name','businessName','email','locations.home.timezone']);
});
test('customer child operations preserve stable keys and require confirmed safe removal',()=>{
 const f=valid();let calls=0;const second=addCustomerLocation(f,()=>{calls++;return 'studio';})!;assert.equal(calls,1);assert.equal(f.locations.length,1);
 const piano=addCustomerPiano(second,'home',()=> 'piano')!;assert.equal(removeCustomerLocation(piano,'home',true),null);assert.equal(removeCustomerLocation(second,'studio',false),null);assert.equal(removeCustomerLocation(f,'home',true),null);
 const reassigned=reassignCustomerPiano(piano,'piano','studio')!;assert.equal(reassigned.pianos[0]!.key,'piano');assert.equal(piano.pianos[0]!.locationKey,'home');assert.equal(removeCustomerLocation(reassigned,'home',true)!.locations[0]!.key,'studio');
 assert.equal(removeCustomerPiano(reassigned,'piano',false),null);assert.equal(removeCustomerPiano(reassigned,'piano',true)!.pianos.length,0);assert.equal(addCustomerPiano(f,'foreign',()=> 'p'),null);assert.equal(addCustomerLocation(f,()=> 'home'),null);assert.equal(reassignCustomerPiano(piano,'piano','foreign'),null);
});
test('customer validation respects Unicode, controls, mailbox and reference boundaries',()=>{
 for(const name of ['😀'.repeat(200),' Name ']){const f=valid();f.name=name;assert.deepEqual(customerFormIssues(f,zones),[]);}
 for(const name of ['\ud800','bad\u0000','😀'.repeat(201)]){const f=valid();f.name=name;assert.ok(customerFormIssues(f,zones).some(i=>i.path==='name'));}
 for(const email of ['a@@example.test','a..b@example.test','a@example..test','a b@example.test','a@example.test\n']){const f=valid();f.email=email;assert.ok(customerFormIssues(f,zones).some(i=>i.path==='email'),email);}
 const f=addCustomerPiano(valid(),'home',()=> 'piano')!;f.pianos[0]!.nickname='Studio';f.pianos[0]!.form='grand';f.pianos[0]!.locationKey='foreign';f.locations.push({...f.locations[0]!});assert.ok(customerFormIssues(f,zones).some(i=>i.code==='duplicate'));assert.ok(customerFormIssues(f,zones).some(i=>i.path==='pianos.piano.locationKey'));
});

test('customer mailbox validation matches exact server mailbox examples',()=>{
 for(const email of ['a@[127.0.0.1]','a@[::1]','ü@example.test','a@-host','a@host-','a@under_score','a@!host','a@a/b']){const f=valid();f.email=email;assert.deepEqual(customerFormIssues(f,zones),[],email);}
 for(const email of ['"a b"@example.test','a@[999.1.1.1]','a@[IPv6:::1]']){const f=valid();f.email=email;assert.ok(customerFormIssues(f,zones).some(i=>i.path==='email'),email);}
});
