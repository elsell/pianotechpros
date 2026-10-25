import test from 'node:test';
import assert from 'node:assert/strict';
import {technicianComparison} from './technician-comparison';
import {emptyTechnicianForm} from './technician-form';
test('technician review compares stable rules, independent origins and set selections without mutating forms',()=>{
 const current=emptyTechnicianForm();current.services=['repair','tuning'];current.availability=[{key:'mon',weekday:0,kind:'available',recurrence:'weekly',start:'09:00',end:'17:00',timezone:'UTC',effectiveStart:'',effectiveEnd:''}];
 const yours=structuredClone(current);yours.services.reverse();yours.availability[0]!.weekday=2;yours.availability[0]!.start='10:';yours.origin.city='Town';
 const rows=technicianComparison(current,yours);assert.deepEqual(rows.map(r=>r.path),['origin.city','availability.mon.weekday','availability.mon.start']);assert.equal(rows[1]!.weekday,2);assert.equal(rows[1]!.current,0);assert.equal(current.availability[0]!.weekday,0);
 yours.availability=[];assert.ok(technicianComparison(current,yours).some(r=>r.path==='availability.mon.start'&&r.yours===null));
});
