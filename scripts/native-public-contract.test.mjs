import test from 'node:test';
import assert from 'node:assert/strict';
import {startNativeUIFixture} from './native-ui-fixture.mjs';
import {createShowroomApiClient} from '../packages/api-client/src/showroom.ts';

test('native public fixture passes the production anonymous client contract',async t=>{
 const fixture=await startNativeUIFixture({inventory:true});t.after(()=>fixture.close());
 const client=createShowroomApiClient(fixture.origin);
 const directory=await client.directory();assert.equal(directory.length,2);
 const page=await client.list('native-public-shop',{limit:12});
 assert.deepEqual(page.pianos.map(p=>p.status),['available','reserved']);
 assert.equal(page.profile.name,'Native Public Showroom');
 for(const piano of page.pianos){
  const listing=await client.listing(page.profile.slug,piano.id);
  assert.deepEqual(listing.piano,piano);assert.ok(piano.publication_revision>=2);
 }
 const sold=await client.list('native-public-shop',{limit:12,search:'UI-PUBLIC-3',availability:'sold'});
 assert.equal(sold.pianos.length,1);assert.equal(sold.pianos[0].status,'sold');
 const empty=await client.list('native-empty-shop',{limit:1});
 assert.deepEqual(empty.pianos,[]);assert.equal(empty.profile.name,'Native Empty Showroom');
});
