'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadDriveRouter } = require('./helpers');

// Functions that perform real financial mutations (posting, sync, approvals, cash submit/
// reconcile, day lock, voucher save/create, sales-order submit, delete/void/reversal). Drive
// Mode voice commands must never be able to invoke any of these directly.
const FINANCIAL_MUTATION_FUNCTIONS = [
  'syncBooks',
  'syncBooksAll',
  'approve',
  'confirmDay',
  'lockDay',
  'reopenDay',
  'saveVoucher',
  'submitSalesOrder',
  'deleteEmployee',
  'deleteCurrent',
  'voidCurrent',
];

function makeHandlerSpy() {
  const calls = { navigate: [], speak: [], setVisual: [], exit: 0, onTranscript: [], getText: [] };
  const handlers = {
    navigate: (id) => calls.navigate.push(id),
    speak: (msg) => calls.speak.push(msg),
    setVisual: (state) => calls.setVisual.push(state),
    exit: () => { calls.exit++; },
    onTranscript: (text) => calls.onTranscript.push(text),
    getText: (id) => { calls.getText.push(id); return undefined; },
  };
  return { calls, handlers };
}

test('Drive Mode router structurally cannot reach financial mutation functions', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const source = routeDriveCommand.toString();
  for (const fn of FINANCIAL_MUTATION_FUNCTIONS) {
    assert.ok(
      !new RegExp('\\b' + fn + '\\s*\\(').test(source),
      'routeDriveCommand source must not call ' + fn + '()',
    );
  }
  // The router only ever interacts with the outside world through the injected handlers object;
  // it does not reference window/document/localStorage, which rules out any other indirect path
  // to a financial mutation.
  for (const forbidden of ['window.', 'document.', 'localStorage']) {
    assert.ok(!source.includes(forbidden), 'routeDriveCommand must not touch ' + forbidden);
  }
});

test('safe navigation commands open the matching screen without any financial side effects', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const cases = [
    ['take me home', 'home'],
    ['open cash reconciliation', 'cash'],
    ['new sales order', 'salesOrder'],
    ['scan a bill', 'add'],
    ['check books queue', 'booksSync'],
    ['open reports', 'reports'],
  ];
  for (const [phrase, expectedTarget] of cases) {
    const { calls, handlers } = makeHandlerSpy();
    const result = routeDriveCommand(phrase, handlers);
    assert.equal(result.type, 'nav');
    assert.equal(result.target, expectedTarget);
    assert.deepEqual(calls.navigate, [expectedTarget]);
    assert.equal(calls.setVisual[0], '');
    assert.equal(calls.speak.length, 1);
    assert.equal(calls.exit, 0);
  }
});

test('read-only status commands speak a value and never navigate', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const { calls, handlers } = makeHandlerSpy();
  const result = routeDriveCommand('what is the cash difference', handlers);
  assert.equal(result.type, 'read');
  assert.equal(result.message, 'Cash difference: SAR 0');
  assert.deepEqual(calls.navigate, []);
  assert.equal(calls.speak.length, 1);

  const pendingSpy = makeHandlerSpy();
  const pendingResult = routeDriveCommand('how many pending approvals', pendingSpy.handlers);
  assert.equal(pendingResult.type, 'read');
  assert.equal(pendingResult.message, 'Pending approvals: 0');
  assert.deepEqual(pendingSpy.calls.navigate, []);
});

test('unsupported commands produce a clear message and no navigation', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const { calls, handlers } = makeHandlerSpy();
  const result = routeDriveCommand('tell me a joke', handlers);
  assert.equal(result.type, 'unsupported');
  assert.equal(result.message, 'Sorry, I did not understand that command.');
  assert.deepEqual(calls.navigate, []);
  assert.equal(calls.speak[0], 'Sorry, I did not understand that command.');
});

test('exit command closes Drive Mode and performs no navigation or speech', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const { calls, handlers } = makeHandlerSpy();
  const result = routeDriveCommand('exit drive mode', handlers);
  assert.equal(result.type, 'exit');
  assert.equal(calls.exit, 1);
  assert.deepEqual(calls.navigate, []);
  assert.deepEqual(calls.speak, []);
});

test('empty or blank input is ignored', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const { calls, handlers } = makeHandlerSpy();
  assert.equal(routeDriveCommand('', handlers), null);
  assert.equal(routeDriveCommand('   ', handlers), null);
  assert.deepEqual(calls.onTranscript, []);
});

test('controlled financial actions only navigate and request manual confirmation, never execute', () => {
  const { routeDriveCommand } = loadDriveRouter();
  const cases = [
    ['submit cash reconciliation', 'cash', 'cash reconciliation'],
    ['reconcile the cash', 'cash', 'cash reconciliation'],
    ['sync books now', 'booksSync', 'Books sync'],
    ['post to books', 'booksSync', 'Books sync'],
    ['lock the day', 'dayClose', 'day lock'],
    ['close the day', 'dayClose', 'day lock'],
    ['approve this entry', 'admin', 'admin approval'],
    ['submit the order', 'salesOrder', 'sales order submission'],
    ['create a receipt', 'voucher', 'receipt voucher'],
    ['save the voucher', 'voucher', 'receipt voucher'],
    ['delete this record', 'detail', 'delete or void'],
    ['void this entry', 'detail', 'delete or void'],
  ];
  for (const [phrase, expectedTarget, label] of cases) {
    const { calls, handlers } = makeHandlerSpy();
    const result = routeDriveCommand(phrase, handlers);
    assert.equal(result.type, 'blocked', 'phrase "' + phrase + '" should be blocked');
    assert.equal(result.target, expectedTarget);
    assert.deepEqual(calls.navigate, [expectedTarget], 'must only navigate, never execute ' + label);
    assert.equal(calls.setVisual[0], 'blocked');
    assert.equal(calls.speak.length, 1);
    assert.match(calls.speak[0], /cannot complete/i);
    assert.match(calls.speak[0], /confirm manually/i);
    // The handler object passed in exposes no mutation capability at all: routeDriveCommand
    // received only navigate/speak/setVisual/exit/onTranscript spies, so there is no function
    // reference it could call to actually post/sync/approve/lock/save/submit/delete/void.
    assert.deepEqual(Object.keys(handlers).sort(), ['exit', 'getText', 'navigate', 'onTranscript', 'setVisual', 'speak']);
  }
});

test('controlled financial action tables cover every protected capability from the issue', () => {
  const { DRIVE_CONTROLLED } = loadDriveRouter();
  const labels = DRIVE_CONTROLLED.map((c) => c.label);
  for (const expected of [
    'cash reconciliation',
    'Books sync',
    'day lock',
    'admin approval',
    'sales order submission',
    'receipt voucher',
    'delete or void',
  ]) {
    assert.ok(labels.includes(expected), 'missing controlled command coverage for: ' + expected);
  }
});

test('delete/void matching is intentionally broad but still fails safe: it only blocks and navigates, never executes', () => {
  // DRIVE_CONTROLLED's delete/void entry (unlike the other entries) matches on the bare words
  // "delete"/"void" with no second co-occurring term, so it also catches ambiguous phrasing that
  // is not a precise delete/void instruction. This is pre-existing production behavior from the
  // already-merged Drive Mode feature and is left unchanged here; this test documents that even
  // over-matching is safe, because the controlled-command branch never executes a mutation - it
  // can only navigate to a screen and ask for manual confirmation.
  const { routeDriveCommand } = loadDriveRouter();
  for (const phrase of ['delete this', 'void this', 'open the void screen', 'delete']) {
    const { calls, handlers } = makeHandlerSpy();
    const result = routeDriveCommand(phrase, handlers);
    assert.equal(result.type, 'blocked');
    assert.equal(result.target, 'detail');
    assert.deepEqual(calls.navigate, ['detail']);
    assert.deepEqual(calls.speak, [result.message]);
    assert.match(result.message, /cannot complete/i);
  }
});
