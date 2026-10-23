import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoRenderScope} from './photo-render-scope';
function fixture(){
 const files=new Set(['old.jpg']);const removed:string[]=[];
 const scope=createPhotoRenderScope({list:()=>[...files],owns:path=>path.endsWith('.jpg'),remove:path=>{removed.push(path);files.delete(path);}});
 return {files,removed,scope};
}
test('failed SDK save removes newly created partial files without touching existing or foreign files',async()=>{
 const f=fixture();await assert.rejects(f.scope.run(async capture=>{capture();f.files.add('partial.jpg');f.files.add('foreign.txt');throw new Error('file:///private/photo.jpg');},()=>true),{message:'native_photo_unavailable'});
 assert.deepEqual(f.removed,['partial.jpg']);assert.deepEqual([...f.files],['old.jpg','foreign.txt']);
});
test('cleanup runs after successful consumption and suppresses late scope results',async()=>{
 const f=fixture();let active=true;
 await assert.rejects(f.scope.run(async capture=>{capture();f.files.add('new.jpg');active=false;return 'bytes';},()=>active),{message:'native_photo_inactive'});
 assert.deepEqual(f.removed,['new.jpg']);
});
test('concurrent preparations cannot capture or remove each other’s files',async()=>{
 const f=fixture();let resume!:()=>void;const paused=new Promise<void>(resolve=>{resume=resolve;});let secondStarted=false;
 const first=f.scope.run(async capture=>{capture();f.files.add('one.jpg');await paused;return 1;},()=>true);
 const second=f.scope.run(async capture=>{secondStarted=true;capture();assert.equal(f.files.has('one.jpg'),false);f.files.add('two.jpg');return 2;},()=>true);
 await Promise.resolve();assert.equal(secondStarted,false);resume();assert.deepEqual(await Promise.all([first,second]),[1,2]);assert.deepEqual(f.removed,['one.jpg','two.jpg']);
});
test('cleanup attempts every owned output and reports failure without path disclosure',async()=>{
 const removed:string[]=[];let files:string[]=[];
 const scope=createPhotoRenderScope({list:()=>files,owns:()=>true,remove:path=>{removed.push(path);if(path==='one')throw new Error('/private/path');}});
 await assert.rejects(scope.run(async capture=>{capture();files=['one','two'];return true;},()=>true),{message:'native_photo_unavailable'});
 assert.deepEqual(removed,['one','two']);
});
