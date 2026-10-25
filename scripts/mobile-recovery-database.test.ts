import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {recoveryBytes} from '../apps/mobile/src/inventory/recovery-bytes';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecoveryDatabase } from '../apps/mobile/src/inventory/recovery-database';
function port(db:DatabaseSync){return {
 execAsync:async(sql:string)=>{db.exec(sql);},
 runAsync:async(sql:string,...params:string[])=>db.prepare(sql).run(...params),
 getFirstAsync:async<T>(sql:string,...params:string[])=>db.prepare(sql).get(...params) as T??null,
};}
test('SQLite checkpoints survive reopening; replacement failure retains the committed checkpoint',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'piano-recovery-'));let db:DatabaseSync|undefined;
 try{
  const file=join(directory,'recovery.db');db=new DatabaseSync(file);let storage=await createRecoveryDatabase(port(db));
  await storage.write('address','sealed-first');await storage.write('other','sealed-other');
  db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON recovery_v1 BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
  await assert.rejects(storage.write('address','sealed-interrupted'));assert.equal(await storage.read('address'),'sealed-first');
  db.close();db=new DatabaseSync(file);storage=await createRecoveryDatabase(port(db));assert.equal(await storage.read('address'),'sealed-first');
  db.exec('DROP TRIGGER fail_update;');await storage.write('address','sealed-next');assert.equal(await storage.read('address'),'sealed-next');
  await storage.remove('address');assert.equal(await storage.read('address'),null);assert.equal(await storage.read('other'),'sealed-other');
  await storage.clear();assert.equal(await storage.read('other'),null);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

test('large encrypted customer checkpoint survives native SQLite reopen and decoding',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'piano-customer-recovery-'));let db:DatabaseSync|undefined;
 try{
  const plain='CUSTOMER'.repeat(200000),key=randomBytes(32),nonce=randomBytes(12),aad=Buffer.from('customer/account/generation');
  const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);const sealed=Buffer.concat([nonce,cipher.update(plain,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
  const file=join(directory,'recovery.db');db=new DatabaseSync(file);await (await createRecoveryDatabase(port(db))).write('customer-address',sealed);db.close();db=new DatabaseSync(file);
  const loaded=await (await createRecoveryDatabase(port(db))).read('customer-address');assert.ok(loaded);const bytes=recoveryBytes(loaded);
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.slice(0,12));decipher.setAAD(aad);decipher.setAuthTag(bytes.slice(-16));assert.equal(Buffer.concat([decipher.update(bytes.slice(12,-16)),decipher.final()]).toString('utf8'),plain);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
