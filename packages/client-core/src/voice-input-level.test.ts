import assert from 'node:assert/strict';
import test from 'node:test';
import {voiceInputLevel} from './voice-input-level';
test('microphone level bounds valid decibels and distinguishes silence from unavailable measurements',()=>{
 assert.equal(voiceInputLevel(-Infinity),0);assert.equal(voiceInputLevel(-100),0);assert.equal(voiceInputLevel(-60),0);assert.equal(voiceInputLevel(-30),50);assert.equal(voiceInputLevel(0),100);assert.equal(voiceInputLevel(8),100);
 for(const value of [undefined,null,NaN,Infinity,'-30',{},[]])assert.equal(voiceInputLevel(value),null);
});
