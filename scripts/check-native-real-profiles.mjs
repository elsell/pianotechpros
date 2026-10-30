// Independent read-back through the actual API. Never seed data here.
import assert from 'node:assert/strict';
import {realNativeSession} from './native-real-service-session.mjs';
const {api,session,identity,fetch}=await realNativeSession();
const profiles={};
for(const domain of ['customer','technician']){
 const path=api+'/v1/'+domain+'-profile';
 for(const authorization of [undefined,'Bearer malformed','Bearer '+identity]){
  assert.equal((await fetch(path,{headers:authorization?{authorization}:{}})).status,401);
 }
 const read=await fetch(path,{headers:{authorization:'Bearer '+session}});
 assert.equal(read.status,process.argv.includes('--empty')?404:200,domain+' persisted read');
 if(read.status===200)profiles[domain]=(await read.json()).data;
}
if(!process.argv.includes('--empty')){
 const customer=profiles.customer,technician=profiles.technician;
 assert.equal(customer.revision,1);assert.equal(technician.revision,1);
 assert.equal(customer.attributes.name,'iOS Customer');assert.equal(customer.attributes.email,'customer@example.test');
 assert.equal(customer.attributes.locations.length,1);
 const location=customer.attributes.locations[0];
 assert.equal(location.label,'Home');assert.equal(location.timezone,'UTC');
 for(const [key,value] of Object.entries({street1:'1 Test Street',city:'Boston',region:'MA',postalCode:'02110'}))assert.equal(location[key],value);
 assert.equal(technician.attributes.name,'iOS Technician');assert.equal(technician.attributes.email,'technician@example.test');
 for(const [key,value] of Object.entries({label:'Workshop',street1:'2 Test Street',city:'Boston',region:'MA',postalCode:'02110'}))assert.equal(technician.attributes.origin[key],value);
 assert.equal(technician.attributes.origin.timezone,'UTC');assert.equal(technician.attributes.radiusMiles,25);
 assert.deepEqual(technician.attributes.services,['tuning']);assert.deepEqual(technician.attributes.forms,['grand']);
 assert.deepEqual(technician.attributes.availability,[],'Incomplete local weekday must never become persisted availability');
 console.log(JSON.stringify({source:'real-api-postgresql-spicedb',customerRevision:customer.revision,technicianRevision:technician.revision,partialDraftPersisted:false}));
}else console.log('Fresh real-service profiles confirmed; unauthorized credentials rejected');
