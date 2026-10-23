import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoViewport} from './photo-viewport';
const touch=(id:number,x:number,y:number)=>({id,x,y});
test('fits aspect ratio, bounds zoom and clamps pan to visible image',()=>{
 const v=createPhotoViewport();v.resize(300,400,600,400);assert.deepEqual(v.snapshot(),{width:300,height:200,scale:1,x:0,y:0});
 v.zoom(4);v.move([touch(1,0,0)]);v.move([touch(1,1000,1000)]);assert.deepEqual(v.snapshot(),{width:300,height:200,scale:4,x:450,y:200});
 v.zoom(0);assert.equal(v.snapshot().scale,1);assert.equal(v.snapshot().x,0);assert.equal(v.snapshot().y,0);
});
test('pinch keeps its focal point and handles finger changes without a jump',()=>{
 const v=createPhotoViewport();v.resize(300,400,300,400);
 v.move([touch(1,175,200),touch(2,225,200)]);v.move([touch(1,150,200),touch(2,250,200)]);
 assert.equal(v.snapshot().scale,2);assert.equal(v.snapshot().x,-50);assert.equal(v.snapshot().y,0);
 const before=v.snapshot();v.move([touch(2,250,200)]);assert.deepEqual(v.snapshot(),before);v.move([touch(2,260,220)]);assert.equal(v.snapshot().x,-40);assert.equal(v.snapshot().y,20);
 const after=v.snapshot();v.move([touch(3,10,10)]);assert.deepEqual(v.snapshot(),after);
});
test('pinch translation follows midpoint and ignores touch order',()=>{
 const v=createPhotoViewport();v.resize(300,400,300,400);v.zoom(2);
 v.move([touch(1,100,100),touch(2,200,100)]);v.move([touch(2,220,120),touch(1,120,120)]);
 assert.equal(v.snapshot().scale,2);assert.equal(v.snapshot().x,20);assert.equal(v.snapshot().y,20);
});
test('interruption, resize and invalid touches cannot jump or poison the viewport',()=>{
 const v=createPhotoViewport();v.resize(300,400,300,400);v.zoom(3);v.move([touch(1,10,10)]);v.end();v.move([touch(1,100,100)]);assert.equal(v.snapshot().x,0);
 v.move([touch(1,NaN,0)]);v.move([touch(1,150,150)]);assert.equal(v.snapshot().x,0);
 v.zoom(Infinity);assert.equal(v.snapshot().scale,3);v.resize(400,300,300,400);assert.deepEqual(v.snapshot(),{width:225,height:300,scale:1,x:0,y:0});
 v.resize(0,0,0,0);assert.deepEqual(v.snapshot(),{width:0,height:0,scale:1,x:0,y:0});
});
test('zero-length pinch and duplicate contacts never produce a nonfinite transform',()=>{
 const v=createPhotoViewport();v.resize(100,100,100,100);v.move([touch(1,50,50),touch(2,50,50)]);v.move([touch(1,0,0),touch(2,100,100)]);assert.equal(v.snapshot().scale,1);
 v.move([touch(1,0,0),touch(1,20,20)]);assert.equal(v.snapshot().scale,1);
});
