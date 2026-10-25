import test from 'node:test';import assert from 'node:assert/strict';import {loadMobileConfig} from './config';
const application={environment:'production',apiURL:'https://api.example.com',oidcIssuer:'https://id.example.com',oidcClientId:'mobile',webURL:'https://piano.example.com'};
test('mobile labels require an explicit public web origin in production',()=>{
 assert.equal(loadMobileConfig({application}).webURL,application.webURL);
 for(const webURL of [undefined,'http://localhost:5173','https://127.0.0.1','https://user@piano.example.com','https://piano.example.com/path','https://piano.example.com?x=1'])assert.throws(()=>loadMobileConfig({application:{...application,webURL}}));
 assert.equal(loadMobileConfig({application:{...application,environment:'development',webURL:undefined}}).webURL,'http://localhost:5173');
});
