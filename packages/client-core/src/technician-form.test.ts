import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTechnicianForm,technicianFormIssues,technicianAttributes,technicianFormFromAttributes,copyTechnicianForm,isTechnicianForm,addTechnicianRule,removeTechnicianRule,moveTechnicianRule} from './technician-form.js';
const zones=new Set(['UTC','CET']);
const valid=()=>{const f=emptyTechnicianForm();f.name='Ada';f.email='ada@example.test';f.origin={label:'Shop',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC'};f.radiusMiles='25';return f;};
test('technician form preserves incomplete numeric and local-time input until valid conversion',()=>{
 const f=valid();assert.deepEqual(technicianFormIssues(f,zones),[]);f.drivingMinutes='1x';f.radiusMiles='2.';
 assert.deepEqual(technicianFormIssues(f,zones),[{path:'radiusMiles',code:'invalid'},{path:'drivingMinutes',code:'invalid'}]);assert.throws(()=>technicianAttributes(f,zones));assert.equal(f.radiusMiles,'2.');
 f.radiusMiles='25';f.drivingMinutes='';assert.equal(technicianAttributes(f,zones).drivingMinutes,null);
 const added=addTechnicianRule(f,()=> 'mon')!;added.availability[0]!.start='09:';assert.ok(technicianFormIssues(added,zones).some(i=>i.path==='availability.mon.start'));assert.equal(added.availability[0]!.start,'09:');
 added.availability[0]!.start='09:00';added.availability[0]!.effectiveStart='2028-02-29';assert.deepEqual(technicianFormFromAttributes(technicianAttributes(added,zones)),added);
});
test('rule operations retain identity and require unused weekdays and confirmation',()=>{
 let f=valid(),calls=0;for(let i=0;i<7;i++){f=addTechnicianRule(f,()=>{calls++;return 'day'+i;})!;assert.equal(f.availability[i]!.weekday,i);}
 assert.equal(calls,7);assert.equal(addTechnicianRule(f,()=>{throw Error('must not allocate');}),null);
 assert.equal(removeTechnicianRule(f,'day0',false),null);assert.equal(moveTechnicianRule(f,'day0',1),null);
 const removed=removeTechnicianRule(f,'day1',true)!;const moved=moveTechnicianRule(removed,'day0',1)!;assert.equal(moved.availability[0]!.key,'day0');assert.equal(moved.availability[0]!.weekday,1);assert.equal(f.availability[0]!.weekday,0);
 assert.equal(addTechnicianRule(removed,()=> 'day0'),null);assert.equal(addTechnicianRule(removed,()=> '../bad'),null);assert.equal(moveTechnicianRule(removed,'missing',1),null);
 moved.origin.timezone='CET';assert.equal(moved.availability[0]!.timezone,'UTC');
});
test('technician searchability preserves legacy unavailable-rule and request preference semantics',()=>{
 const f=valid();f.searchable=true;assert.deepEqual(technicianFormIssues(f,zones).map(i=>i.path),['services','forms','availability']);
 f.services=['tuning'];f.forms=['upright'];f.acceptsRequestsWithoutAvailability=true;assert.deepEqual(technicianFormIssues(f,zones),[]);
 f.acceptsRequestsWithoutAvailability=false;const withRule=addTechnicianRule(f,()=> 'mon')!;withRule.availability[0]!.kind='unavailable';assert.deepEqual(technicianFormIssues(withRule,zones),[]);
});
test('technician validation rejects invalid dates, bounds, Unicode, catalog and duplicate selections',()=>{
 const base=addTechnicianRule(valid(),()=> 'mon')!;
 for(const change of [(f:typeof base)=>f.availability[0]!.effectiveStart='2026-02-29',(f:typeof base)=>f.availability[0]!.end='08:00',(f:typeof base)=>f.availability[0]!.timezone='Local',(f:typeof base)=>f.origin.timezone='unknown',(f:typeof base)=>f.services=['tuning','tuning'],(f:typeof base)=>f.forms=['full_size_upright'],(f:typeof base)=>f.radiusMiles='501',(f:typeof base)=>f.drivingMinutes='1441',(f:typeof base)=>f.name='\ud800',(f:typeof base)=>f.email='Name <a@example.test>',(f:typeof base)=>f.biography='bad\x00',(f:typeof base)=>f.availability.push({...f.availability[0]!})]){const f=copyTechnicianForm(base);change(f);assert.ok(technicianFormIssues(f,zones).length);}
 for(const email of ['a@[127.0.0.1]','a@[::1]','ü@example.test']){const f=valid();f.email=email;assert.deepEqual(technicianFormIssues(f,zones),[]);}
 const f=valid();f.name='😀'.repeat(200);f.biography='two\nlines';assert.deepEqual(technicianFormIssues(f,zones),[]);
});
test('technician form boundaries copy values and recovery retains incomplete bounded shapes',()=>{
 const f=addTechnicianRule(valid(),()=> 'mon')!;f.services=['tuning'];f.forms=['grand'];const wire=technicianAttributes(f,zones);wire.origin.label='Changed';wire.services[0]='repair';wire.availability[0]!.end='15:00';assert.equal(f.origin.label,'Shop');assert.equal(f.services[0],'tuning');assert.equal(f.availability[0]!.end,'17:00');
 f.radiusMiles='unfinished';assert.equal(isTechnicianForm(f),true);assert.equal(isTechnicianForm({...f,owner:'private'}),false);assert.equal(isTechnicianForm({...f,radiusMiles:'x'.repeat(10001)}),false);assert.equal(isTechnicianForm({...f,origin:{...f.origin,timezone:null}}),false);
});
