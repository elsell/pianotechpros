import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedVoiceCachePath} from './voice-cache-path';
test('voice reads/cleanup accept only exact SDK audio cache files',()=>{
 const root='file:///app/cache/',name='recording-12345678-abcd-1234-abcd-123456789abc.m4a';
 for(const dir of ['Audio','ExpoAudio'])assert.equal(ownedVoiceCachePath(root,root+dir+'/'+name),true);
 for(const suffix of [name,'../Audio/'+name,'Audio/../'+name,'Audio/%2e%2e/'+name,'Audio/'+name+'?query','Audio/'+name+'#fragment','Audio/nested/'+name,'ImagePicker/'+name,'Audio/recording-any.m4a'])assert.equal(ownedVoiceCachePath(root,root+suffix),false);
 assert.equal(ownedVoiceCachePath(root,'file:///app/cache-other/Audio/'+name),false);assert.equal(ownedVoiceCachePath(root,'https://example.com/Audio/'+name),false);
});
