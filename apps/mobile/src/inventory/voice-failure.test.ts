import test from 'node:test';
import assert from 'node:assert/strict';
import {InventoryClientError,VoiceClientError} from '@pianotechpros/api-client';
import {nativeVoiceFailure} from './voice-failure';
test('native voice treats preflight credential rejection as denial and retains transient failures',()=>{
 for(const status of [401,403,404])assert.equal(nativeVoiceFailure(new InventoryClientError('unauthenticated',status)),'denied');
 assert.equal(nativeVoiceFailure(new VoiceClientError('not_found',404)),'denied');
 assert.equal(nativeVoiceFailure(new VoiceClientError('network',0)),'network');
 assert.equal(nativeVoiceFailure(new VoiceClientError('rate_limited',429)),'rate_limited');
 assert.equal(nativeVoiceFailure(new Error('PRIVATE')),'unavailable');
});
