import test from 'node:test';import assert from 'node:assert/strict';import {loadMobileConfig} from './config';
const application={environment:'production',apiURL:'https://api.example.com',oidcIssuer:'https://id.example.com',oidcClientId:'mobile',webURL:'https://piano.example.com'};
test('mobile labels require an explicit public web origin in production',()=>{
 assert.equal(loadMobileConfig({application}).webURL,application.webURL);
 for(const webURL of [undefined,'http://localhost:5173','https://127.0.0.1','https://user@piano.example.com','https://piano.example.com/path','https://piano.example.com?x=1'])assert.throws(()=>loadMobileConfig({application:{...application,webURL}}));
 assert.equal(loadMobileConfig({application:{...application,environment:'development',webURL:undefined}}).webURL,'http://localhost:5173');
});
test('native inquiry configuration fails closed unless policy is explicit',()=>{
 assert.equal(loadMobileConfig({application}).inquiry.policy,'unavailable');
 assert.equal(loadMobileConfig({application:{...application,inquiryChallengePolicy:'disabled'}}).inquiry.policy,'disabled');
 assert.deepEqual(loadMobileConfig({application:{...application,inquiryChallengePolicy:'enabled',turnstileSiteKey:'public-key'}}).inquiry,{policy:'enabled',siteKey:'public-key'});
 for(const settings of [{inquiryChallengePolicy:'enabled'},{inquiryChallengePolicy:'disabled',turnstileSiteKey:'leftover'},{inquiryChallengePolicy:false},{turnstileSiteKey:123},{inquiryChallengePolicy:'unknown'}])assert.throws(()=>loadMobileConfig({application:{...application,...settings}}));
});
