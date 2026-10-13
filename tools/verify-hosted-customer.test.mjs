import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHostedEvidence, verifyHosted } from './verify-hosted-customer.mjs';

const baseline = { manifest: { name: 'MENAFoodsCustomer', version: '12.5.16-dept1-staged' }, serviceWorker: "const CACHE='menafoods-customer-v12.5.16';", health: { ok: true, service: 'mf_zoho_gateway', version: '12.3.26' } };
test('matching manifest, service worker and existing gateway', () => {
  const r = evaluateHostedEvidence(baseline);
  assert.equal(r.ok, true);
  assert.equal(r.clientVersion, '12.5.16');
  assert.equal(r.gatewayVersion, '12.3.26');
});
test('a newer private staged build is never mislabeled live', () => {
  const r = evaluateHostedEvidence({ ...baseline, expectedClient: '12.5.18' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /Expected hosted client 12.5.18/);
});
test('service-worker drift fails closed', () => {
  const r = evaluateHostedEvidence({ ...baseline, serviceWorker: "const CACHE='menafoods-customer-v12.5.15';" });
  assert.equal(r.ok, false);
});
test('unverified gateway or wrong service fails', () => {
  const r = evaluateHostedEvidence({ ...baseline, health: { ok: true, service: 'wrong', version: '12.3.26' } });
  assert.equal(r.ok, false);
});
test('hosted manifest with historical not-deployed label triggers warning', () => {
  const r = evaluateHostedEvidence({ ...baseline, manifest: { ...baseline.manifest, description: 'staged, not deployed' } });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});
test('fetches only the three read-only public paths, with no credentials', async () => {
  const paths = [];
  const fetcher = async (url, options) => {
    paths.push(url.pathname);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined);
    const data = url.pathname.endsWith('client-package.json') ? JSON.stringify(baseline.manifest) : url.pathname.endsWith('sw.js') ? baseline.serviceWorker : JSON.stringify(baseline.health);
    return { ok: true, text: async () => data };
  };
  const r = await verifyHosted({ expectedClient: '12.5.16', fetcher });
  assert.equal(r.ok, true);
  assert.deepEqual(paths.sort(), ['/app/client-package.json', '/app/sw.js', '/mf-api/health'].sort());
});
