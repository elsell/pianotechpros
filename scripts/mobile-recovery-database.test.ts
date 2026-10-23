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
