// Run against a locally extracted, owner-approved MENAFoodsCustomer release ZIP.
// Static checks only: does NOT authenticate, deploy, or call live APIs.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
if (!process.argv[2]) { console.error('Usage: node tools/verify-customer-client.mjs <client-directory>'); process.exit(2); }
const dir = resolve(process.argv[2]);
const file = name => { const p = join(dir, name); if (!existsSync(p)) throw new Error('Missing: '+name); return readFileSync(p,'utf8'); };
try {
  const js=file('assets/app.js'), html=file('index.html'), css=file('assets/styles.css'), sw=file('sw.js');
  const info=JSON.parse(file('client-package.json'));
  const v=String(info.version||'');
  const start=js.indexOf('async function buyAgainOrder('), end=js.indexOf('function orderItemRows(');
  const checks={
    'catalogue-wide search':js.includes('function catalogMatches('),
    'progressive rendering':js.includes('catalogPageSize'),
    'reorder control':start>=0&&end>start,
    'reorder does not submit checkout':start>=0&&end>start&&!js.slice(start,end).includes('/customer/checkout/submit'),
    'account-switch guard':js.includes('Business account changed. Reopen the order'),
    'variant and unit matching':js.includes('matchingReorderLine(')&&js.includes('packagesFor(product)'),
    'same-origin existing gateway':js.includes('const FUNCTION_API=')&&js.includes('/server/mf_zoho_gateway'),
    'labelled product search':html.includes('aria-label="Search live MENAFoods products"'),
    'catalogue paging control':html.includes('id="catalogMoreBtn"'),
    'contained dynamic images':css.includes('object-fit:contain'),
    'version references':v.startsWith('12.5.14')&&js.includes(v)&&html.includes('v=12.5.14')&&sw.includes('v12.5.14'),
    'no PEM private keys in touched sources':![js,html,css].some(s=>/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s)),
  };
  for (const [name,ok] of Object.entries(checks)) console.log((ok?'PASS':'FAIL')+' '+name);
  if (Object.values(checks).some(ok=>!ok)) process.exit(1);
  console.log('Static checks passed. Deployment, auth and Books checkout are NOT verified.');
} catch (err) { console.error('FAIL: '+err.message); process.exit(1); }
