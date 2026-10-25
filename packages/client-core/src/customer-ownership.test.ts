import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerOwnershipRegistry} from './customer-ownership.js';
import {customerRecoveryIdentity} from './customer-recovery.js';
test('customer ownership shares canonical identity and old release cannot release a successor',async()=>{
 const a=customerRecoveryIdentity({userID:'user',apiBaseURL:'https://api.example.test/'});const b=customerRecoveryIdentity({userID:'user',apiBaseURL:'https://api.example.test'});assert.equal(a.key,b.key);
 const owners=createCustomerOwnershipRegistry();const first=(await owners.acquire(a.key))!;assert.equal(await owners.acquire(b.key),null);assert.ok(await owners.acquire('other'));
 await first.release();const second=(await owners.acquire(a.key))!;await first.release();assert.equal(await owners.acquire(a.key),null);await second.release();assert.ok(await owners.acquire(a.key));
});
