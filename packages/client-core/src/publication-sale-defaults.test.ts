import test from 'node:test';import assert from 'node:assert/strict';import {publicationSaleDefaults} from './publication-sale-defaults';
test('saved asking price defaults preserve exact units, currency and decimal separator',()=>{
 assert.deepEqual(publicationSaleDefaults({minor_units:123450,currency:'EUR'},','),{amount:'1234,50',currency:'EUR'});
 assert.deepEqual(publicationSaleDefaults({minor_units:0,currency:'USD'},'.'),{amount:'0.00',currency:'USD'});
 assert.deepEqual(publicationSaleDefaults({minor_units:12345,currency:'JPY'},','),{amount:'12345',currency:'JPY'});
 assert.deepEqual(publicationSaleDefaults({minor_units:Number.MAX_SAFE_INTEGER,currency:'USD'},'.'),{amount:'90071992547409.91',currency:'USD'});
});
test('missing or malformed price never silently becomes a zero sale',()=>{for(const price of [null,undefined,{},0,{minor_units:-1,currency:'USD'},{minor_units:1.2,currency:'USD'},{minor_units:Infinity,currency:'USD'},{minor_units:1,currency:'BAD'}])assert.deepEqual(publicationSaleDefaults(price,'.'),{amount:'',currency:'USD'});});
