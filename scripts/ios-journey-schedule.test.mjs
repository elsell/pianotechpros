import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scheduler = fileURLToPath(new URL('./ios-journey-schedule.sh', import.meta.url));
function run(failures = '') {
  // Controlled command runner: exercises the shell scheduling boundary without
  // pretending that Xcode, an app or a simulator has executed.
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "$1"
    restart_app() { echo restart; }
    run_journey() { echo "run $1"; [[ ",$FAILURES," != *",$1,"* ]]; }
    verify_inventory() { echo verify; [[ ",$FAILURES," != *",persisted,"* ]]; }
    record_journey() { echo "$1 $2"; }
    run_ios_journey_schedule
  `, 'schedule-test', scheduler], { encoding: 'utf8', env: { ...process.env, FAILURES: failures }, timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, '');
  return { status: result.status, lines: result.stdout.trim().split('\n') };
}

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
