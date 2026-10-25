import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTechnicianForm} from '../packages/client-core/src/technician-form';
import {technicianSection,applyTechnicianValue,technicianChoice} from '../apps/mobile/src/technician/model';
test('native technician focus routes fields and edits stable rule identity without mutating input',()=>{
 const f=emptyTechnicianForm();f.availability=[{key:'mon',weekday:0,kind:'available',recurrence:'weekly',start:'09:00',end:'17:00',timezone:'UTC',effectiveStart:'',effectiveEnd:''}];
 assert.deepEqual(technicianSection('availability.mon.start'),{kind:'rule',key:'mon'});assert.deepEqual(technicianSection('radiusMiles'),{kind:'origin'});
 const changed=applyTechnicianValue(f,'availability.mon.start','09:');assert.equal(changed.availability[0]!.start,'09:');assert.equal(f.availability[0]!.start,'09:00');assert.deepEqual(applyTechnicianValue(f,'availability.missing.start','10:00'),f);
 assert.equal(applyTechnicianValue(f,'origin.city','Austin').origin.city,'Austin');
});
test('native choices exclude occupied weekdays and preserve multiple work selections',()=>{
 const f=emptyTechnicianForm();f.services=['tuning'];f.availability=[{key:'mon',weekday:0,kind:'available',recurrence:'weekly',start:'09:00',end:'17:00',timezone:'UTC',effectiveStart:'',effectiveEnd:''},{key:'tue',weekday:1,kind:'unavailable',recurrence:'weekly',start:'09:00',end:'17:00',timezone:'UTC',effectiveStart:'',effectiveEnd:''}];
 const choice=technicianChoice(f,'availability.mon.weekday',['UTC']);assert.ok(choice);assert.deepEqual(choice!.selected,['0']);assert.equal(choice!.options.some(v=>v.value==='1'),false);
 assert.equal(technicianChoice(f,'services',['UTC'])!.multiple,true);assert.deepEqual(technicianChoice(f,'services',['UTC'])!.selected,['tuning']);assert.equal(technicianChoice(f,'availability.missing.timezone',['UTC']),null);
 const moved=applyTechnicianValue(f,'availability.mon.weekday','1');assert.equal(moved.availability[0]!.weekday,0);
});
