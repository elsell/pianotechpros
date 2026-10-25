import test from 'node:test';
import assert from 'node:assert/strict';
import {createTechnicianOwnershipRegistry} from './technician-ownership.js';
import {technicianRecoveryIdentity} from './technician-recovery.js';
test('technician ownership shares canonical identity and old release cannot release a successor',async()=>{
 const a=technicianRecoveryIdentity({userID:'user',apiBaseURL:'https://api.example.test/'});const b=technicianRecoveryIdentity({userID:'user',apiBaseURL:'https://api.example.test'});assert.equal(a.key,b.key);
 const owners=createTechnicianOwnershipRegistry();const first=(await owners.acquire(a.key))!;assert.equal(await owners.acquire(b.key),null);assert.ok(await owners.acquire('other'));
 await first.release();const second=(await owners.acquire(a.key))!;await first.release();assert.equal(await owners.acquire(a.key),null);await second.release();assert.ok(await owners.acquire(a.key));
});
