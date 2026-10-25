import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryScanLink,parseInventoryScanLink} from './inventory-scan-link.js';
const token='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
test('scan links are canonical, origin-bound and token-private outside the fragment',()=>{
 const url=createInventoryScanLink('https://piano.example','shop-1',token);
 assert.equal(url,`https://piano.example/scan#v=1&dealer=shop-1&token=${token}`);
 assert.deepEqual(parseInventoryScanLink('https://piano.example',url),{dealerID:'shop-1',token});
 assert.equal(new URL(url).pathname,'/scan');assert.equal(new URL(url).search,'');
 for(const link of [url.replace('piano.example','foreign.example'),url.replace('/scan#','/scan?token=secret#'),url+'&token='+token,url+'&extra=1',url.replace('v=1','v=2'),url.replace('/scan','/other'),url.replace('dealer=shop-1','dealer=shop%2D1'),url.replace('https://','https://user:password@'),url+'\n',url.replace(token,'A'.repeat(43)),url.replace(token,token.slice(0,42)+'F'),'javascript:alert(1)','x'.repeat(2049)])assert.throws(()=>parseInventoryScanLink('https://piano.example',link),error=>error instanceof Error&&error.message==='invalid_scan_link');
 for(const origin of ['http://piano.example','https://user@piano.example','https://piano.example/path','https://piano.example?x=1','https://piano.example#x'])assert.throws(()=>createInventoryScanLink(origin,'shop',token));
 for(const id of ['shop\n','shop/other','', 'a'.repeat(129)])assert.throws(()=>createInventoryScanLink('https://piano.example',id,token));
 for(const invalidToken of [token+'\n',token+'=', 'A'.repeat(43)])assert.throws(()=>createInventoryScanLink('https://piano.example','shop',invalidToken));
 assert.ok(createInventoryScanLink('http://localhost:5173','shop',token).startsWith('http://localhost:5173/scan#'));
});
