import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeBannerPicker} from './native-banner-picker.js';
import {createDealerBanner} from './dealer-banner.js';
import type {NativePickerResult} from './native-photo-picker.js';
function fixture(){
 const rows=new Map<string,string>();let owner:string|null=null,active=true,uploads=0,previews=0;
 const initial={profile:{id:'shop',revision:1},banner:null};
 const editor=createDealerBanner({dealerID:'shop',initial,key:()=> 'upload-intent-001',load:async()=>initial,
 upload:async()=>{uploads++;return {...initial,profile:{id:'shop',revision:2},banner:{id:'banner',width:2,height:2},bannerID:'banner',replay:false};},remove:async()=>initial,
 denied:()=>false,conflict:()=>false,rejected:()=>false});
 const port={userID:'user',dealerID:'shop',active:()=>active,editor,
 now:()=>1000,key:()=> 'picker-intent-001',authorize:async()=>{},lease:async()=>()=>{},
 owner:{read:async()=>owner,write:async(v:string|null)=>{owner=v;}},
 storage:async()=>({read:async(k:string)=>rows.get(k)??null,write:async(k:string,v:string)=>{rows.set(k,v);},remove:async(k:string)=>{rows.delete(k);}}),
 pending:async()=>null,launch:async():Promise<NativePickerResult>=>({kind:'selected',asset:{uri:'file:///cache/picker.jpg',width:2,height:2}}),
 discard:async()=>{},prepare:async():Promise<Uint8Array>=>new Uint8Array([255,216,255]),selected:()=>{previews++;},
 };
 return {port,editor,rows,open:()=>createNativeBannerPicker(port),invalidate:()=>{active=false;},counts:()=>({uploads,previews})};
}
test('restored native banner selection requires preview then explicit upload',async()=>{
 const f=fixture();const picker=f.open();await picker.select('library');assert.equal(picker.snapshot().state.status,'selected');
 assert.deepEqual(f.counts(),{uploads:0,previews:0});
 const restored=f.open();await restored.restore();assert.equal(restored.snapshot().state.status,'selected');
 await restored.consume();assert.equal(f.editor.snapshot().phase,'upload-review');assert.deepEqual(f.counts(),{uploads:0,previews:1});assert.equal(f.rows.size,0);
 await f.editor.confirmUpload();assert.equal(f.counts().uploads,1);
});
test('another banner target cannot consume or redirect a pending selection',async()=>{
 const f=fixture();await f.open().select('library');
 const other=createNativeBannerPicker({...f.port,dealerID:'other'});await other.restore();assert.equal(other.snapshot().error,'other_target');
 await other.consume();assert.deepEqual(f.counts(),{uploads:0,previews:0});
});
test('late native processing after scope loss cannot publish a preview',async()=>{
 const f=fixture();let finish!:(bytes:Uint8Array)=>void;
 f.port.prepare=()=>new Promise(resolve=>finish=resolve);
 const picker=f.open();await picker.select('library');const pending=picker.consume();
 for(let i=0;i<50&&!finish;i++)await Promise.resolve();assert.ok(finish);f.invalidate();
 const bytes=new Uint8Array([255,216,255]);finish(bytes);await pending;
 assert.deepEqual(f.counts(),{uploads:0,previews:0});assert.equal(f.editor.snapshot().hasSelection,false);assert.deepEqual([...bytes],[0,0,0]);
});
test('scope loss during selection clears the unreviewed local image',async()=>{
 const f=fixture();f.editor.subscribe(state=>{if(state.hasSelection)f.invalidate();});
 const picker=f.open();await picker.select('library');await picker.consume();
 assert.equal(f.editor.snapshot().hasSelection,false);
 await f.editor.confirmUpload();assert.deepEqual(f.counts(),{uploads:0,previews:0});
});
test('failed preview construction clears the unreviewed local image and temporary bytes',async()=>{
 const f=fixture(),bytes=new Uint8Array([255,216,255]);f.port.prepare=async()=>bytes;
 f.port.selected=()=>{throw new Error('preview_failed');};
 const picker=f.open();await picker.select('library');await picker.consume();
 assert.equal(f.editor.snapshot().hasSelection,false);assert.deepEqual([...bytes],[0,0,0]);
 await f.editor.confirmUpload();assert.deepEqual(f.counts(),{uploads:0,previews:0});
});
