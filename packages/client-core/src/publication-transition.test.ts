import assert from 'node:assert/strict';
import test from 'node:test';
import {publicationTransitionFromInput} from './publication-transition.js';
const input={status:'sold',amount:'90071992547409,91',currency:'USD',reason:''};
test('sale entry produces an exact immutable explicit command',()=>{
 const command=publicationTransitionFromInput(input,'available',',');assert.deepEqual(command,{kind:'transition',status:'sold',salePrice:{minor_units:9007199254740991,currency:'USD'},reason:''});
 assert.deepEqual(publicationTransitionFromInput({...input,amount:'0'},'available',',').salePrice,{minor_units:0,currency:'USD'});
 assert.deepEqual(publicationTransitionFromInput({...input,amount:'100',currency:'JPY'},'available',',').salePrice,{minor_units:100,currency:'JPY'});
});
test('sale and correction validation rejects ambiguous amounts and absent reasons',()=>{
 for(const amount of ['', '1e3','1.20','2,','-1','90071992547409,92'])assert.throws(()=>publicationTransitionFromInput({...input,amount},'available',','));
 for(const status of ['sold','archived'])assert.throws(()=>publicationTransitionFromInput({...input,status:'available'},status,','));
 assert.throws(()=>publicationTransitionFromInput({...input,status:'draft'},'available',','));
 assert.throws(()=>publicationTransitionFromInput({...input,status:'invalid'},'available',','));
 assert.throws(()=>publicationTransitionFromInput({...input,reason:'x'.repeat(1001)},'available',','));
 assert.throws(()=>publicationTransitionFromInput({...input,reason:'\ud800'},'available',','));
});
test('non-sale changes exclude stale sale input and trim correction reason',()=>{
 assert.deepEqual(publicationTransitionFromInput({...input,status:'available',reason:' Sale cancelled '},'sold',','),{kind:'transition',status:'available',salePrice:null,reason:'Sale cancelled'});
});
