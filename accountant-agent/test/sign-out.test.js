'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { readIndexHtml, extractFunctionSource } = require('./helpers');

// Operational records written through the localStorage-backed `store` helper (accounting
// documents, vouchers, cash, sales orders, employees, etc.). Sign-out must never touch these.
const OPERATIONAL_KEYS = [
  'accountRequests',
  'cash',
  'documents',
  'employees',
  'productProposals',
  'salesOrderDraft',
  'salesOrders',
  'vouchers',
  'mf_books_items',
  'mf_last_batch_sync',
];

function makeLocalStorage(seed) {
  const map = new Map(Object.entries(seed));
  const removed = [];
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => { removed.push(k); map.delete(k); },
    _map: map,
    _removed: removed,
  };
}

function runSignOut(source) {
  const fnSource = extractFunctionSource(source, 'signOutMENAFoods');
  const fetchCalls = [];
  const seed = Object.fromEntries(OPERATIONAL_KEYS.map((k) => [k, JSON.stringify([{ id: 1 }])]));
  seed.mf_session = JSON.stringify({ token: 'abc' });
  const localStorage = makeLocalStorage(seed);
  let sessionStorageCleared = false;
  let locationHref = 'https://example.app/';
  const context = {
    MF_USER: 'https://example.app/mf-user',
    fetch: (url, opts) => {
      fetchCalls.push({ url, opts });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    },
    localStorage,
    sessionStorage: { clear: () => { sessionStorageCleared = true; } },
    location: {
      get href() { return locationHref; },
      set href(v) { locationHref = v; },
    },
    setTimeout,
    Promise,
    console,
  };
  vm.createContext(context);
  const done = vm.runInContext(fnSource + ';\nsignOutMENAFoods();', context);
  return { done, fetchCalls, localStorage, get sessionStorageCleared() { return sessionStorageCleared; }, get locationHref() { return locationHref; } };
}

test('sign-out clears only auth/session state and leaves operational localStorage untouched', async () => {
  const source = readIndexHtml();
  const outcome = runSignOut(source);
  // signOutMENAFoods() returns a promise; await it directly instead of a fixed timeout so the
  // test is deterministic regardless of how fast/slow the host machine is.
  await outcome.done;

  assert.deepEqual(outcome.localStorage._removed, ['mf_session'], 'sign-out must remove only the mf_session key');
  for (const key of OPERATIONAL_KEYS) {
    assert.ok(outcome.localStorage._map.has(key), 'operational key must survive sign-out: ' + key);
  }
  assert.equal(outcome.sessionStorageCleared, true);
  assert.equal(outcome.locationHref, 'mfapp://signout');
  assert.equal(outcome.fetchCalls.length, 1, 'sign-out must notify the backend logout endpoint exactly once');
  assert.equal(outcome.fetchCalls[0].url, 'https://example.app/mf-user/logout');
  assert.equal(outcome.fetchCalls[0].opts.method, 'POST');
  assert.equal(outcome.fetchCalls[0].opts.credentials, 'include');
});

test('sign-out does not reference any sign-in trigger, so it cannot immediately sign the user back in', () => {
  const source = readIndexHtml();
  const fnSource = extractFunctionSource(source, 'signOutMENAFoods');
  assert.ok(!/startMENAFoodsSignIn|loadSession\(/.test(fnSource), 'signOutMENAFoods must not call sign-in functions');
});
