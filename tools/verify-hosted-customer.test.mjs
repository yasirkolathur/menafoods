import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHostedEvidence, evaluateAssetRoutes, verifyHosted } from './verify-hosted-customer.mjs';

const baseline = { manifest: { name: 'MENAFoodsCustomer', version: '12.5.16-dept1-staged' }, serviceWorker: "const CACHE='menafoods-customer-v12.5.16';", health: { ok: true, service: 'mf_zoho_gateway', version: '12.3.26' } };
test('relative client assets stay within the hosted app route', () => {
  assert.equal(evaluateAssetRoutes('<script src="assets/app.js?v=12.5.20"></script><link href="styles.css">').ok, true);
});
test('gateway app scripts and styles flag mixed route risk', () => {
  const r = evaluateAssetRoutes('<script src="/server/mf_zoho_gateway/app/assets/app.js"></script><link href=\'/server/mf_zoho_gateway/app/styles.css\'>');
  assert.equal(r.ok, false);
  assert.equal(r.mismatches.length, 2);
});
test('same-origin absolute gateway assets are detected without fetching them', () => {
  assert.equal(evaluateAssetRoutes(`<script src="${'https://menafoodscustomermiddleware-809407193.development.catalystserverless.com'}/server/mf_zoho_gateway/app/main.js">`).ok, false);
});
test('API paths, external assets and non-app links are not classified as stale app assets', () => {
  assert.equal(evaluateAssetRoutes('<a href="/server/mf_zoho_gateway/customer/profile">Profile</a><script src="https://cdn.example.com/sdk.js">').ok, true);
});
test('optional HTML inspection fails despite matching version metadata and never follows asset links', async () => {
  const paths = [];
  const fetcher = async url => {
    paths.push(url.pathname);
    const data = url.pathname.endsWith('client-package.json') ? JSON.stringify(baseline.manifest) : url.pathname.endsWith('sw.js') ? baseline.serviceWorker : url.pathname.endsWith('index.html') ? '<script src="/server/mf_zoho_gateway/app/main.js">' : JSON.stringify(baseline.health);
    return { ok: true, text: async () => data };
  };
  const r = await verifyHosted({ checkAssetRoutes: true, fetcher });
  assert.equal(r.ok, false);
  assert.deepEqual(paths.sort(), ['/app/client-package.json', '/app/sw.js', '/mf-api/health', '/app/index.html'].sort());
});
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

