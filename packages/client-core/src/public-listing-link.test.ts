import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicListingLink} from './public-listing-link.js';
const target={origin:'https://pianos.example',dealerID:'shop',recordID:'12345678-1234-4234-8234-123456789abc'};
const profile={id:'shop',slug:'workshop'};
const listing={profile,piano:{id:target.recordID,dealer_id:'shop',title:'Published grand'}};
test('native sharing resolves the current anonymous publication after the authorized shop',async()=>{
 const calls:string[]=[];const link=await resolvePublicListingLink(target,{profile:async()=>{calls.push('private_profile');return profile;},listing:async(slug,id)=>{assert.equal(slug,'workshop');assert.equal(id,target.recordID);calls.push('public_listing');return listing;}},new AbortController().signal);
 assert.deepEqual(calls,['private_profile','public_listing']);assert.equal(link.title,'Published grand');assert.equal(link.url,'https://pianos.example/showrooms/workshop/pianos/published-grand-'+target.recordID);
});
test('scope loss and mismatched public identity cannot prepare a share link',async()=>{
 const abort=new AbortController();let calls=0;
 await assert.rejects(resolvePublicListingLink(target,{profile:async()=>{abort.abort();return profile;},listing:async()=>{calls++;return listing;}},abort.signal));assert.equal(calls,0);
 for(const result of [{...listing,profile:{...profile,id:'other'}},{...listing,piano:{...listing.piano,dealer_id:'other'}},{...listing,piano:{...listing.piano,id:'other'}}])await assert.rejects(resolvePublicListingLink(target,{profile:async()=>profile,listing:async()=>result},new AbortController().signal));
});
