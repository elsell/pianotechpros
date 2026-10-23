import assert from 'node:assert/strict';
import test from 'node:test';
import {inventoryFormFromAttributes, inventoryAttributesFromForm, isInventoryForm, inventoryFormErrors} from './inventory-form.js';
test('money preserves exact minor units, zero, absent values and locale precision',()=>{
 const f=inventoryFormFromAttributes({stock_number:'A',asking_price:{minor_units:9007199254740991,currency:'USD'}},',');assert.equal(f.asking_amount,'90071992547409,91');assert.equal(inventoryAttributesFromForm(f).asking_price?.minor_units,9007199254740991);
 f.asking_amount='0';assert.equal(inventoryAttributesFromForm(f).asking_price?.minor_units,0);f.asking_amount='';assert.equal(inventoryAttributesFromForm(f).asking_price,null);
 for(const bad of ['1.50','1,234','2,','-1','1e3','90071992547409,92']){f.asking_amount=bad;assert.ok(inventoryFormErrors(f).includes('asking_amount'));assert.throws(()=>inventoryAttributesFromForm(f));}
 f.asking_currency='JPY';f.asking_amount='1200';assert.equal(inventoryAttributesFromForm(f).asking_price?.minor_units,1200);f.asking_amount='1,1';assert.throws(()=>inventoryAttributesFromForm(f));
});
test('partial dates preserve precision and reject invented or invalid dates',()=>{
 const f=inventoryFormFromAttributes({stock_number:'A',manufactured:{year:1920,month:0,day:0}},'.');assert.equal(f.year,'1920');assert.equal(f.month,'');assert.equal(f.day,'');assert.deepEqual(inventoryAttributesFromForm(f).manufactured,{year:1920,month:0,day:0});
 f.month='2';f.day='29';assert.deepEqual(inventoryAttributesFromForm(f).manufactured,{year:1920,month:2,day:29});f.year='1900';assert.ok(inventoryFormErrors(f).includes('day'));f.month='';assert.throws(()=>inventoryAttributesFromForm(f));
});
test('recovery shape accepts incomplete user input but rejects malformed values and extra data',()=>{
 const f=inventoryFormFromAttributes({stock_number:'A'},'.');f.asking_amount='12.';f.year='20';assert.equal(isInventoryForm(f),true);assert.equal(isInventoryForm({...f,featured:'yes'}),false);assert.equal(isInventoryForm({...f,credential:'secret'}),false);assert.equal(isInventoryForm({...f,decimal:'?'}),false);
});
