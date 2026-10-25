import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {recoveryBytes} from '../apps/mobile/src/inventory/recovery-bytes';
test('persisted sealed bytes reopen without changing nonce, ciphertext or tag',()=>{
 for(const length of [0,1,2,3,100,1024]){
 const key=randomBytes(32),iv=randomBytes(12),plain=randomBytes(length),aad=Buffer.from('account/generation/journal');
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const sealed=Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const bytes=recoveryBytes(sealed.toString('base64'));assert.deepEqual(Buffer.from(bytes),sealed);
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.slice(0,12));decipher.setAAD(aad);decipher.setAuthTag(bytes.slice(-16));
 assert.deepEqual(Buffer.concat([decipher.update(bytes.slice(12,-16)),decipher.final()]),plain);
 }
});
test('malformed, noncanonical and oversized ciphertext fails with fixed diagnostic',()=>{
 for(const value of ['', 'AA==','!!!!','AAAA\n','A===','A'.repeat(36)+'AB==','A'.repeat(36)+'AAB=','A'.repeat(1400004)])assert.throws(()=>recoveryBytes(value),/^Error: inventory_storage_unavailable$/);
});
