import test from 'node:test';
import assert from 'node:assert/strict';
import {showroomFilters} from './showroom-browse.js';
test('public browse filters retain exact localized amounts and zero',()=>{
 assert.deepEqual(showroomFilters({currency:'EUR',minimum:'0',maximum:'12,50'},','),{limit:12,currency:'EUR',minPrice:0,maxPrice:1250});
 assert.throws(()=>showroomFilters({minimum:'12'},'.'));
 assert.throws(()=>showroomFilters({currency:'USD',minimum:'20',maximum:'10'},'.'));
 assert.throws(()=>showroomFilters({form:'draft'},'.'));
 assert.throws(()=>showroomFilters({search:'a\nb'},'.'));
 assert.deepEqual(showroomFilters({search:' piano ',availability:'sold'},'.'),{limit:12,search:'piano',availability:'sold'});
});
