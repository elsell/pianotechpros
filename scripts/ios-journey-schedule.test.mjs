import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scheduler = fileURLToPath(new URL('./ios-journey-schedule.sh', import.meta.url));
function run(failures = '', realProfiles = false) {
  // Controlled command runner: exercises the shell scheduling boundary without
  // pretending that Xcode, an app or a simulator has executed.
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "$1"
    restart_app() { echo restart; }
    run_journey() { echo "run $1"; [[ ",$FAILURES," != *",$1,"* ]]; }
    verify_inventory() { echo verify; [[ ",$FAILURES," != *",persisted,"* ]]; }
    verify_lifecycle() { echo "verify-$1"; [[ ",$FAILURES," != *",$1-persisted,"* ]]; }
    verify_profiles() { echo verify-profiles; [[ ",$FAILURES," != *",persisted,"* ]]; }
    record_journey() { echo "$1 $2"; }
    ${realProfiles === 'lifecycle' ? 'run_ios_real_lifecycle_schedule' : realProfiles === 'inventory' ? 'run_ios_real_inventory_schedule' : realProfiles ? 'run_ios_real_profile_schedule' : 'run_ios_journey_schedule'}
  `, 'schedule-test', scheduler], { encoding: 'utf8', env: { ...process.env, FAILURES: failures }, timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, '');
  return { status: result.status, lines: result.stdout.trim().split('\n') };
}

test('real profiles require creation, protected recovery and independent persisted read', () => {
  const result=run('',true);
  assert.equal(result.status,0);
  assert.deepEqual(result.lines,['restart','run create','create passed','restart','run restore','restore passed','verify-profiles','persisted passed']);
  for(const failure of ['create','restore','persisted']){
    const rejected=run(failure,true);
    assert.equal(rejected.status,1);
    assert.ok(rejected.lines.includes(`${failure} failed`));
    if(failure==='create')assert.ok(!rejected.lines.includes('run restore'));
  }
});

test('real inventory keeps browse/readiness failures and gates reopen on persistence', () => {
  const result=run('','inventory');
  assert.equal(result.status,0);
  assert.equal(result.lines.filter(line=>line.endsWith(' passed')).length,5);
  assert.ok(result.lines.indexOf('verify')<result.lines.indexOf('run reopen'));
  for(const failure of ['inventory','readiness','edit','persisted','reopen']){
    const rejected=run(failure,'inventory');
    assert.equal(rejected.status,1);
    assert.ok(rejected.lines.includes(`${failure} failed`));
    if(['edit','persisted'].includes(failure))assert.ok(!rejected.lines.includes('run reopen'));
    else if(failure!=='reopen')assert.ok(rejected.lines.includes('reopen passed'));
  }
});

test('all required journeys pass only after persisted verification and app restarts', () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(result.lines.filter(line => line === 'restart').length, 8);
  assert.ok(result.lines.indexOf('verify') < result.lines.indexOf('run reopen'));
  assert.equal(result.lines.filter(line => line.endsWith(' passed')).length, 9);
});

test('public failure retains independent profile, inventory and accessibility evidence', () => {
  const result = run('public');
  assert.equal(result.status, 1);
  for (const name of ['create', 'inventory', 'reopen', 'accessibility']) assert.ok(result.lines.includes(`${name} passed`));
  assert.ok(result.lines.includes('public failed'));
});

test('profile setup failure blocks authenticated dependents but still runs accessibility', () => {
  const result = run('create');
  assert.equal(result.status, 1);
  for (const name of ['restore', 'inventory', 'readiness', 'edit', 'persisted', 'reopen']) {
    assert.ok(result.lines.includes(`${name} blocked`));
    assert.ok(!result.lines.includes(`run ${name}`));
  }
  assert.ok(result.lines.includes('accessibility passed'));
});

test('independent restore and browse failures do not hide editing or accessibility failures', () => {
  const result = run('restore,inventory,accessibility');
  assert.equal(result.status, 1);
  for (const name of ['restore', 'inventory', 'accessibility']) assert.ok(result.lines.includes(`${name} failed`));
  assert.ok(result.lines.includes('reopen passed'));
});

test('failed edit or independent persistence check blocks restart acceptance', () => {
  for (const failure of ['edit', 'persisted']) {
    const result = run(failure);
    assert.equal(result.status, 1);
    assert.ok(result.lines.includes('reopen blocked'));
    assert.ok(!result.lines.includes('run reopen'));
    assert.ok(result.lines.includes('accessibility passed'));
    if (failure === 'edit') assert.ok(!result.lines.includes('verify'));
  }
});

test('sale and correction require separate read-back and preserve dependency order',()=>{
 const passed=run('','lifecycle');assert.equal(passed.status,0);
 assert.ok(passed.lines.indexOf('verify-sale')<passed.lines.indexOf('run correction'));
 assert.ok(passed.lines.includes('correction-persisted passed'));
 for(const failure of ['sale','sale-persisted','correction','correction-persisted']){
  const result=run(failure,'lifecycle');assert.equal(result.status,1);
  assert.ok(result.lines.includes(`${failure} failed`));
  if(failure.startsWith('sale'))assert.ok(!result.lines.includes('run correction'));
 }
});
