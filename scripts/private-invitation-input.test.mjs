import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {fillPrivateInvitation} from './private-invitation-input.mjs';
test('failed browser invitation entry never exposes its code in diagnostics',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<textarea disabled aria-label="Invitation"></textarea>');
  await assert.rejects(()=>fillPrivateInvitation(page.getByRole('textbox'),'PRIVATE_INVITATION_SENTINEL',{timeout:50}),error=>{
   assert.equal(error.message,'invitation_entry_failed');assert.equal(error.cause,undefined);assert.ok(!error.stack.includes('PRIVATE_INVITATION_SENTINEL'));return true;
  });
 }finally{await browser.close();}
});
