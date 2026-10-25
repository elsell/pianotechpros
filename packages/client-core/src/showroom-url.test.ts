import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPianoPath,publicPianoID} from './showroom-url.js';
const id='12345678-1234-4234-8234-123456789abc';
test('published titles produce bounded readable aliases and retain immutable identity',()=>{
 const path=publicPianoPath('workshop',{id,title:'Érard & Sons / Grand'});
 assert.equal(path,`/showrooms/workshop/pianos/erard-sons-grand-${id}`);
 assert.equal(publicPianoID(path.split('/').at(-1)!),id);
 assert.equal(publicPianoID(id.toUpperCase()),id);
 assert.equal(publicPianoID(`old-published-title-${id}`),id);
 assert.ok(publicPianoPath('workshop',{id,title:'a'.repeat(1000)}).length<180);
});
test('blank or non-Latin titles and safe opaque identifiers retain usable paths',()=>{
 assert.equal(publicPianoPath('workshop',{id,title:'🎹'}),`/showrooms/workshop/pianos/${id}`);
 assert.equal(publicPianoPath('workshop',{id:'piano-1',title:'Grand'}),'/showrooms/workshop/pianos/piano-1');
 assert.equal(publicPianoID('piano-1'),'piano-1');
});
test('malformed path segments cannot extract an embedded identifier',()=>{
 for(const segment of ['', '../'+id, id+'?token=private',id+'/photos','%2f'+id,'a'.repeat(200),`prefix-${id}-suffix`])assert.throws(()=>publicPianoID(segment));
 for(const slug of ['../shop','shop?x=1',''])assert.throws(()=>publicPianoPath(slug,{id,title:'Grand'}));
});
