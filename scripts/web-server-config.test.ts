import assert from 'node:assert/strict';
import test from 'node:test';
import {parseServerApiURL} from '../apps/web/src/lib/config.ts';
const development={environment:'development' as const,apiURL:'http://localhost:8080',oidcIssuer:'http://localhost:5556/dex',oidcClientId:'web'};
const production={...development,environment:'production' as const,apiURL:'https://api.example.com',oidcIssuer:'https://identity.example.com'};
test('server API override is separate from the browser configuration',()=>{
 assert.equal(parseServerApiURL(undefined,development),development.apiURL);
 assert.equal(parseServerApiURL('http://api:8080',development),'http://api:8080');
 assert.equal(development.apiURL,'http://localhost:8080');
 assert.equal(parseServerApiURL(undefined,production),'https://api.example.com');
 assert.equal(parseServerApiURL('https://server-api.example.com',production),'https://server-api.example.com');
});
test('server API override rejects unsafe URLs and preserves production constraints',()=>{
 for(const environment of [development,production])for(const value of ['', ' ', 'ftp://api.example.com','http://user:secret@api.example.com','https://api.example.com?token=secret','https://api.example.com/#fragment'])assert.throws(()=>parseServerApiURL(value,environment));
 for(const value of ['http://api:8080','http://localhost:8080','https://127.0.0.1','https://192.168.1.2'])assert.throws(()=>parseServerApiURL(value,production));
});
