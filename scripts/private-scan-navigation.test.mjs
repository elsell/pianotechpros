import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {navigatePrivateScan} from './private-scan-navigation.mjs';
test('real browser navigation failure does not expose a scan fragment',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await assert.rejects(()=>navigatePrivateScan(page,'http://127.0.0.1:0/scan#token=PRIVATE_SCAN_SENTINEL'),error=>{
   assert.equal(error.message,'scan_navigation_failed');assert.equal(error.cause,undefined);assert.ok(!error.stack.includes('PRIVATE_SCAN_SENTINEL'));return true;
  });
 }finally{await browser.close();}
});
