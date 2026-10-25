import assert from 'node:assert/strict';
import test from 'node:test';
import {inquiryChallengeConfig} from './inquiry-config.js';
test('inquiry challenge policy never infers disabled verification',()=>{
 assert.deepEqual(inquiryChallengeConfig(undefined,undefined),{policy:'unavailable'});
 assert.deepEqual(inquiryChallengeConfig('disabled',''),{policy:'disabled'});
 assert.deepEqual(inquiryChallengeConfig('enabled','public-key_123'),{policy:'enabled',siteKey:'public-key_123'});
 for(const [policy,key] of [[undefined,'orphan'],['disabled','orphan'],['enabled',''],['unknown',''],[' enabled','key'],['enabled','bad key'],['enabled','x'.repeat(257)]])assert.throws(()=>inquiryChallengeConfig(policy,key));
});
