import test from 'node:test';
import assert from 'node:assert/strict';
import {customerComparison} from './customer-comparison';
import {emptyCustomerForm,addCustomerLocation,addCustomerPiano} from './customer-form';
test('customer comparison includes removed and added children, booleans and empty optional values',()=>{
 const current=addCustomerPiano(addCustomerLocation(emptyCustomerForm(),()=> 'home')!,'home',()=> 'piano')!;
 current.locations[0].label='Home';current.pianos[0].nickname='Grand';
 const yours=addCustomerLocation({...current,name:'Edited',pianos:[]},()=> 'studio')!;
 yours.locations[1].label='Studio';yours.isBusiness=true;
 const changes=customerComparison(current,yours);
 assert.ok(changes.some(c=>c.path==='name'&&c.current===''&&c.yours==='Edited'));
 assert.ok(changes.some(c=>c.path==='isBusiness'&&c.current===false&&c.yours===true));
 assert.ok(changes.some(c=>c.path==='pianos.piano.nickname'&&c.context==='Grand'&&c.current==='Grand'&&c.yours===null));
 assert.ok(changes.some(c=>c.path==='locations.studio.label'&&c.current===null&&c.yours==='Studio'));
 assert.deepEqual(customerComparison(current,current),[]);
});
test('customer comparison distinguishes reassignment between identically named locations',()=>{
 const form=addCustomerLocation(addCustomerLocation(emptyCustomerForm(),()=> 'a')!,()=> 'b')!;
 form.locations[0].label='Home';form.locations[0].street1='1 First';form.locations[1].label='Home';form.locations[1].street1='2 Second';
 const current=addCustomerPiano(form,'a',()=> 'piano')!;const yours=structuredClone(current);yours.pianos[0].locationKey='b';
 const change=customerComparison(current,yours).find(c=>c.path==='pianos.piano.locationKey');assert.ok(change);assert.notEqual(change.current,change.yours);assert.equal(change.current,'Home · 1 First');assert.equal(change.yours,'Home · 2 Second');
});
