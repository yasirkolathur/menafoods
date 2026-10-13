// Verify a PRIVATE, owner-approved, extracted MENAFoodsCustomer bundle.
// Static-only; no Zoho credentials, provider writes, deploys, or live tests.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
if (!process.argv[2]) { console.error('Usage: node tools/verify-customer-client.mjs <extracted-client-directory>'); process.exit(2); }
const dir=resolve(process.argv[2]);
const file=n=>{const p=join(dir,n);if(!existsSync(p))throw new Error('Missing '+n);return readFileSync(p,'utf8')};
try {
 const js=file('assets/app.js'),html=file('index.html'),css=file('assets/styles.css'),sw=file('sw.js');
 const info=JSON.parse(file('client-package.json'));
 const v=String(info.version||'');
 const reorder=js.slice(js.indexOf('function matchingReorderLine('),js.indexOf('function orderItemRows('));
 const unit=js.slice(js.indexOf('function unitConfigForProduct('),js.indexOf('function unitDisplay('));
 const catalogue=js.slice(js.indexOf('let catalogueFetchStatus='),js.indexOf('async function loadCatalogue('));
 const checks={
  'source version 12.5.17':v.startsWith('12.5.17')&&js.includes(v)&&html.includes('v=12.5.17')&&sw.includes('v12.5.17'),
  'search and progressive results':js.includes('function catalogMatches(')&&js.includes('catalogPageSize')&&html.includes('id="catalogMoreBtn"'),
  'correct provider page cursor':catalogue.includes('page=${page}')&&!catalogue.includes('page_start_from='),
  'partial catalogue warning':catalogue.includes('catalogueFetchStatus')&&catalogue.includes('has_more_page'),
  'hidden products excluded':catalogue.includes('show_in_storefront===false'),
  'reorder uses protected order details':reorder.includes('/customer/orders/'),
  'reorder confirms exact variant':reorder.includes('candidates.length!==1')&&reorder.includes('if(variant)'),
  'reorder does not submit':!reorder.includes("method:'POST'")&&!reorder.includes('/customer/checkout/submit'),
  'account switch protected':reorder.includes('Business account changed. Reopen the order'),
  'only customer selling price in unit config':!unit.includes('purchase_price')&&!unit.includes('purchase_rate')&&!unit.includes('base_unit_price')&&!unit.includes('default_margin'),
  'saved cart line totals recomputed':js.includes('line.line_total=Number('),
  'same origin Catalyst gateway':js.includes('const FUNCTION_API=')&&js.includes('/server/mf_zoho_gateway'),
  'search labelled':html.includes('aria-label="Search live MENAFoods products"'),
  'images contained':css.includes('object-fit:contain'),
  'unrelated SW caches preserved':sw.includes("startsWith('menafoods-customer-')"),
  'version gate not bypassed':!html.includes("localStorage.setItem('mf_app_version'"),
  'scoped account reset':js.includes('function resetScopedCustomerView()')&&js.includes("function customerScope("),
  'fresh business session after switch':js.includes('await checkSession(true)')&&js.includes('loadBranches(),applyBooksCustomerPrices()'),
  'stale prices fail closed':js.includes('if(scope!==customerScope(state.customer))return null;'),
  'old customer 360 repeat disabled':!js.includes("'/repeat'")&&!js.includes("`/repeat`")&&!js.includes("}/repeat`"),
  'no purchase metadata injected into raw':!js.includes('base_unit_price:rule.base_unit_price')&&!js.includes('default_margin:rule.default_margin'),
  'unit overlay base snapshot':js.includes('function restoreProductUnitRuleOverlay(p)')&&js.includes('CUSTOMER_UNIT_RULE_FIELDS')&&js.includes('p._mfUnitRuleOriginal='),
  'account reset removes unit overrides':js.includes('restoreProductUnitRuleOverlay(p);')&&js.includes('state.selectedProduct=null'),
  'checkout business guard':js.includes('function currentCheckoutScope(scope)')&&js.includes('if(!currentCheckoutScope(scope))return;'),
  'checkout old receipt cannot clear next business':js.includes("const receipt=await api('/customer/orders'")&&js.includes('if(!currentCheckoutScope(scope))return;'),
  'order retry reuses idempotency key':js.includes('const requestKey=checkoutIdempotencyKey()')&&js.includes("'Idempotency-Key':requestKey"),
  'KPI scope guard':js.includes('async function loadAccountKpis()')&&js.includes('if(scope!==customerScope(state.customer))return;'),
  'service worker version parity':js.includes("register('sw.js?v=12.5.17')"),
  'no private key literals':![js,html,css].some(s=>/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s)),
 };
 for(const [k,pass] of Object.entries(checks))console.log(`${pass?'PASS':'FAIL'} ${k}`);
 if(Object.values(checks).some(x=>!x))process.exit(1);
 console.log('Static-only PASS. Live deployment, authenticated/role QA, and Books order remain unverified.');
} catch(error) { console.error('FAIL '+error.message);process.exit(1); }
