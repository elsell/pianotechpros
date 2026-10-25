import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryFormFromAttributes} from './inventory-form.js';
import {validInventoryVoiceProposal,applyInventoryVoiceProposal} from './inventory-voice.js';
const form=()=>inventoryFormFromAttributes({stock_number:'PT-1',title:'Old',featured:true,asking_price:{minor_units:100,currency:'USD'}},',');
const proposal=()=>({revision:1,transcript:'Grand piano, not featured, zero yen, made in 1920',candidates:[
 {field:'title',value:{text:'Grand piano'},confidence:'high',evidence:'Grand piano'},
 {field:'featured',value:{boolean:false},confidence:'high',evidence:'not featured'},
 {field:'asking_price',value:{money:{minor_units:0,currency:'JPY'}},confidence:'uncertain',evidence:'zero yen'},
 {field:'manufactured',value:{date:{year:1920,month:0,day:0}},confidence:'high',evidence:'1920'},
]});
test('voice review selects fields without destroying incomplete manual input and undo preserves later edits',()=>{
 const p=proposal();assert.ok(validInventoryVoiceProposal(p));const before=form();before.cost_amount='1,';before.day='3';
 const change=applyInventoryVoiceProposal(p,before,{...before},['title','featured','asking_price','manufactured']);
 assert.deepEqual(change.conflicts,[]);assert.ok(change.change);const after=change.change.after();
 assert.equal(after.title,'Grand piano');assert.equal(after.featured,false);assert.equal(after.asking_amount,'0');assert.equal(after.asking_currency,'JPY');assert.equal(after.year,'1920');assert.equal(after.day,'');assert.equal(after.cost_amount,'1,');
 after.title='Manual correction';after.private_notes='Keep';const undo=change.change.undo(after);
 assert.deepEqual(undo.conflicts,['title']);assert.equal(undo.form.title,'Manual correction');assert.equal(undo.form.featured,true);assert.equal(undo.form.asking_amount,'1,00');assert.equal(undo.form.day,'3');assert.equal(undo.form.private_notes,'Keep');
 p.candidates[0]!.value.text='Changed externally';const copy=change.change.after();copy.title='another';assert.equal(change.change.after().title,'Grand piano');
});
test('review applies atomically against the values actually shown',()=>{
 const before=form(),current={...before,title:'Typed while reviewing'};const result=applyInventoryVoiceProposal(proposal(),before,current,['title','featured']);
 assert.deepEqual(result.conflicts,['title']);assert.equal(result.change,null);assert.equal(current.featured,true);
 for(const selection of [['publish'],['title','title'],['private_notes']])assert.throws(()=>applyInventoryVoiceProposal(proposal(),before,before,selection));
 const only=applyInventoryVoiceProposal(proposal(),before,current,['featured']);assert.equal(only.change!.after().title,current.title);
});
test('proposal validator rejects malformed shape, injected fields and invalid typed data',()=>{
 const mutations:Array<(p:any)=>void>=[p=>p.status='published',p=>p.revision=0,p=>p.candidates.push(p.candidates[0]),p=>p.candidates[0].field='photos',p=>p.candidates[0].value.boolean=false,p=>p.candidates[0].value.text=' ',p=>p.candidates[0].evidence='invented',p=>p.candidates[0].confidence='certain',p=>p.candidates[0].value.text='\ud800',p=>p.candidates[2].value.money.minor_units=0.5,p=>p.candidates[2].value.money.currency='KWD',p=>delete p.candidates[2].value.money.minor_units,p=>p.candidates[3].value.date.day=1,p=>p.candidates[3].value.date.year=0,p=>p.transcript='x'.repeat(16001)];
 for(const mutate of mutations){const p=proposal();mutate(p);assert.equal(validInventoryVoiceProposal(p),false);assert.throws(()=>applyInventoryVoiceProposal(p,form(),form(),['title']));}
});
test('price and date groups preserve concurrent edits as a unit',()=>{
 const before=form(),current={...before,asking_currency:'CAD'};
 assert.deepEqual(applyInventoryVoiceProposal(proposal(),before,current,['asking_price']).conflicts,['asking_price']);
 const c=applyInventoryVoiceProposal(proposal(),before,before,['asking_price','manufactured']).change!;const after=c.after();after.month='2';after.asking_currency='USD';
 const undone=c.undo(after);assert.deepEqual(undone.conflicts,['asking_price','manufactured']);assert.equal(undone.form.year,'1920');assert.equal(undone.form.asking_amount,'0');
});

test('all 18 field variants apply and undo with exact money and partial dates',()=>{
 const values:Record<string,unknown>={stock_number:'PT-NEW',title:'Grand',make:'Yamaha',model:'C3',serial:'123',size:'6 feet',finish:'Black',location:'Room 2',description:'Concert piano',private_notes:'Bench needed',form:'grand',condition:'used',featured:false,player_system:true,price_visible:false,asking_price:{minor_units:Number.MAX_SAFE_INTEGER,currency:'USD'},acquisition_cost:{minor_units:0,currency:'CAD'},manufactured:{year:2000,month:2,day:29}};
 const candidates=Object.entries(values).map(([field,value])=>({field,value:typeof value==='string'?{text:value}:typeof value==='boolean'?{boolean:value}:field==='manufactured'?{date:value}:{money:value},confidence:'high',evidence:'description'}));
 const p={revision:9,transcript:'description',candidates};assert.ok(validInventoryVoiceProposal(p));const initial=form();
 const change=applyInventoryVoiceProposal(p,initial,initial,Object.keys(values)).change!;const after=change.after();
 assert.equal(after.asking_amount,'90071992547409,91');assert.equal(after.cost_amount,'0,00');assert.equal(after.day,'29');assert.equal(after.stock_number,'PT-NEW');assert.equal(after.player_system,true);
 assert.deepEqual(change.undo(after).form,initial);
 const fields=change.fields();fields.length=0;assert.ok(change.fields().length>0);
});
test('a decimal-style change cannot silently reinterpret a monetary undo',()=>{
 const before=form();const change=applyInventoryVoiceProposal(proposal(),before,before,['asking_price']).change!;
 const current={...change.after(),decimal:'.' as const};assert.deepEqual(change.undo(current).conflicts,['asking_price']);
 assert.deepEqual(applyInventoryVoiceProposal(proposal(),before,{...before,decimal:'.'},['asking_price']).conflicts,['asking_price']);
});
