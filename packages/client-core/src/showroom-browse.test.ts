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
import {showroomFilterControlsVisible} from './showroom-browse.js';
test('small showroom controls preserve recovery and sold discovery',()=>{
 assert.equal(showroomFilterControlsVisible({},0,false),false);
 assert.equal(showroomFilterControlsVisible({},1,false),false);
 assert.equal(showroomFilterControlsVisible({},2,false),true);
 assert.equal(showroomFilterControlsVisible({},1,true),true);
 for(const fields of [{search:'grand'},{availability:'all'},{form:'grand'},{currency:'USD'},{minimum:'0'},{maximum:'0'},{cursor:'page'}])assert.equal(showroomFilterControlsVisible(fields,0,false),true);
 assert.equal(showroomFilterControlsVisible({search:'  ',form:'',availability:''},1,false),false);
});
test('editing search cannot hide the control before the new query is submitted',()=>{
 assert.equal(showroomFilterControlsVisible({search:'no-match'},0,false,''),true);
 assert.equal(showroomFilterControlsVisible({search:'only-match'},1,false,''),true);
 assert.equal(showroomFilterControlsVisible({},0,false,'not submitted'),true);
 assert.equal(showroomFilterControlsVisible({},1,false,' '),true);
 assert.equal(showroomFilterControlsVisible({},1,false,''),false);
});
