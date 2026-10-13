// Read-only Development check for the existing MENAFoodsCustomer deployment.
// Never sends credentials or accesses orders, prices, invoices or private API routes.
import { pathToFileURL } from 'node:url';

export const DEVELOPMENT_ORIGIN = 'https://menafoodscustomermiddleware-809407193.development.catalystserverless.com';
const versionOf = value => /^\d+\.\d+\.\d+/.exec(String(value ?? '').trim())?.[0] ?? null;

export function evaluateHostedEvidence({ manifest, serviceWorker, health, expectedClient }) {
  const clientVersion = versionOf(manifest?.version);
  const swVersion = /menafoods-customer-v(\d+\.\d+\.\d+)/.exec(String(serviceWorker ?? ''))?.[1] ?? null;
  const gatewayVersion = versionOf(health?.version);
  const errors = [];
  const warnings = [];
  if (manifest?.name !== 'MENAFoodsCustomer' || !clientVersion) errors.push('Invalid customer manifest');
  if (!swVersion || clientVersion !== swVersion) errors.push('Client manifest and service worker versions differ');
  if (health?.ok !== true || health?.service !== 'mf_zoho_gateway' || !gatewayVersion) errors.push('Existing Catalyst gateway health is unverified');
  if (expectedClient && clientVersion !== versionOf(expectedClient)) errors.push('Expected hosted client ' + (versionOf(expectedClient) ?? 'invalid') + '; observed ' + (clientVersion ?? 'unknown'));
  if (/not deployed/i.test(String(manifest?.description ?? ''))) warnings.push('Hosted manifest description still says "not deployed"; verify release metadata');
  return { ok: errors.length === 0, clientVersion, swVersion, gatewayVersion, errors, warnings };
}

async function getText(fetcher, route) {
  const url = new URL(route, DEVELOPMENT_ORIGIN);
  const response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(route + ' returned HTTP ' + response.status);
  return response.text();
}

export async function verifyHosted({ expectedClient, fetcher = fetch } = {}) {
  const [manifestText, serviceWorker, healthText] = await Promise.all([
    getText(fetcher, '/app/client-package.json'),
    getText(fetcher, '/app/sw.js'),
    getText(fetcher, '/mf-api/health'),
  ]);
  return evaluateHostedEvidence({ manifest: JSON.parse(manifestText), serviceWorker, health: JSON.parse(healthText), expectedClient });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv.find(a => a.startsWith('--expected-client='));
  verifyHosted({ expectedClient: arg?.split('=', 2)[1] }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    else console.log('Read-only version parity PASS; no authenticated flow or deployed-source equivalence verified.');
  }).catch(error => { console.error('FAIL ' + error.message); process.exitCode = 1; });
}
