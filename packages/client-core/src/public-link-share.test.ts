import test from 'node:test';
import assert from 'node:assert/strict';
import {sharePublicLink} from './public-link-share.js';
test('sharing passes only the explicit public URL and title through the native port',async()=>{
 const sent:unknown[]=[];assert.equal(await sharePublicLink({url:'https://pianos.example/showrooms/shop/pianos/piano',title:'Grand'},{share:async value=>{sent.push(value);},copy:async()=>{throw Error('unexpected_copy');}}),'shared');
 assert.deepEqual(sent,[{url:'https://pianos.example/showrooms/shop/pianos/piano',title:'Grand'}]);
});
test('desktop copies the public URL, while cancellation is neutral and failures remain visible',async()=>{
 const link={url:'https://pianos.example/showrooms/shop/pianos/piano',title:'Grand'};let copied='';
 assert.equal(await sharePublicLink(link,{copy:async value=>{copied=value;}}),'copied');assert.equal(copied,link.url);
 assert.equal(await sharePublicLink(link,{share:async()=>{const e=new Error('cancelled');e.name='AbortError';throw e;},copy:async()=>{throw Error('must_not_copy');}}),'cancelled');
 await assert.rejects(sharePublicLink(link,{copy:async()=>{throw Error('denied');}}));
});
test('unsafe destinations and query-bearing links never reach a platform capability',async()=>{
 let calls=0;for(const url of ['javascript:alert(1)','https://user:secret@pianos.example/showrooms/shop/pianos/id','https://pianos.example/showrooms/shop/pianos/id?token=secret','https://pianos.example/scan#secret','https://pianos.example/private'])await assert.rejects(sharePublicLink({url,title:'Grand'},{copy:async()=>{calls++;}}));
 assert.equal(calls,0);
});
