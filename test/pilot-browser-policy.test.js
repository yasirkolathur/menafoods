import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizePilotBrowser, toPilotPublicProduct
} from '../src/api/lib/pilot-browser-policy.js';

const target = {
  projectId: '17990000000237407',
  projectName: 'menafoodscustomermiddleware',
  environment: 'Development'
};
const member = () => ({
  userId: 'pilot-user', role: 'PILOT_AI_AGENT', status: 'ACTIVE',
  readOnly: true, emailConfirmed: true, approvedBy: 'owner-id',
  businessId: 'demo-business',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString()
});
const valid = () => ({
  session: { userId: 'pilot-user', verified: true },
  request: {
    method: 'GET', pathname: '/mf-api/products',
    query: new URLSearchParams('business_id=demo-business')
  },
  target, lookupMembership: async () => member(), audit: async () => {}
});
const fails = (overrides, status, reason) =>
  assert.rejects(
    authorizePilotBrowser({ ...valid(), ...overrides }),
    e => e.status === status && e.message === reason
  );
const withMember = props => ({ lookupMembership: async () => ({ ...member(), ...props }) });
const withQuery = raw => ({
  request: {
    method: 'GET', pathname: '/mf-api/products', query: new URLSearchParams(raw)
  }
});

test('valid confirmed owner-approved scoped read-only pilot GET', async () => {
  const result = await authorizePilotBrowser(valid());
  assert.deepEqual(
    Object.keys(result).sort(),
    ['businessId','method','permitted','readOnly','role','userId'].sort()
  );
  assert.equal(result.businessId, 'demo-business');
  assert.equal(result.readOnly, true);
});
test('denies absent or unsigned session', async () => {
  await fails({session:null},401,'authenticated_pilot_session_required');
  await fails({session:{userId:'pilot-user',role:'PILOT_AI_AGENT'}},401,
    'authenticated_pilot_session_required');
});
test('denies ordinary App User', () =>
  fails(withMember({role:'App User'}),403,'pilot_membership_not_approved'));
test('denies deactivated or invited pilot', async () => {
  for (const status of ['INVITED','DISABLED','PENDING']) {
    await fails(withMember({status}),403,'pilot_membership_not_approved');
  }
});
test('denies unconfirmed email account', () =>
  fails(withMember({emailConfirmed:false}),403,'pilot_membership_not_approved'));
test('denies missing Owner approval', () =>
  fails(withMember({approvedBy:''}),403,'pilot_membership_not_approved'));
test('denies expired or unparseable pilot grant', async () => {
  for (const expiresAt of [null,'not-a-date',new Date(Date.now()-1000).toISOString()])
    await fails(withMember({expiresAt}),403,'pilot_membership_not_approved');
});
test('denies missing tenant, user mismatch or writable membership', async () => {
  for (const attrs of [{businessId:''},{userId:'another'}, {readOnly:false}])
    await fails(withMember(attrs),403,'pilot_membership_not_approved');
});
test('denies membership provider failures with safe error', () =>
  fails({lookupMembership: async () => {throw new Error('raw DB error');}},
    503,'pilot_membership_unavailable'));
test('rejects missing provider configuration', () =>
  fails({lookupMembership:null},503,'pilot_guard_not_configured'));
test('refuses Production or other Catalyst project', async () => {
  await fails({target:{...target,environment:'Production'}},403,'development_only');
  await fails({target:{...target,projectId:'another'}},403,'project_not_allowed');
});
test('denies all write methods', async () => {
  for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])
    await fails({request:{method,pathname:'/mf-api/products'}},405,'pilot_read_only');
});
test('forbids bootstrap, Admin, orders, wallets, finops and other paths', async () => {
  for (const pathname of [
    '/mf-api/bootstrap','/mf-api/admin','/mf-api/orders','/mf-api/wallet',
    '/mf-api/finops/credit/decision', '/mf-api/product/%2e%2e/admin',
    '/mf-api/products/one/two','/mf-api/products/123/','/app/#admin'
  ]) {
    await fails({request:{method:'GET',pathname}},403,'pilot_route_not_allowlisted');
  }
});
test('allows health, categories, products and simple item details', async () => {
  for (const pathname of [
    '/mf-api/health','/mf-api/categories','/mf-api/products',
    '/mf-api/products/FR09'
  ]) {
    const ctx = valid();
    ctx.request = {method:'HEAD',pathname};
    assert.equal((await authorizePilotBrowser(ctx)).permitted,true);
  }
});
test('denies cross-business query', () =>
  fails(withQuery('business_id=another'),403,'pilot_business_scope_mismatch'));
test('denies customer, supplier, role and secret query parameters', async () => {
  for (const q of [
    'customer_id=1','supplier-id=1','role=Admin','token=any',
    'user_id=123','api_key=123','arbitrary=1'
  ]) {
    await fails(withQuery(q),403,'pilot_query_forbidden');
  }
});
test('denies duplicate query keys including case changes', async () => {
  for (const q of ['q=one&q=two','q=one&Q=two','business_id=demo-business&business-id=another']) {
    await fails(withQuery(q),403,'pilot_duplicate_query_key');
  }
});
test('denies excessive query count and oversized query values', async () => {
  await fails(withQuery('q=hi&page=1&page_size=4&limit=5&cursor=a&category=frozen&business_id=demo-business&x=1'),
    403,'pilot_query_forbidden');
  await fails(withQuery('q='+encodeURIComponent('a'.repeat(82))),403,'pilot_invalid_search');
  await fails(withQuery('cursor='+encodeURIComponent('a'.repeat(257))),403,'pilot_query_too_long');
});
test('denies invalid pagination, category and cursor formats', async () => {
  for (const q of ['page=-1','page=0','page=501','page_size=60','limit=90'])
    await fails(withQuery(q),403,'pilot_invalid_pagination');
  await fails(withQuery('category=%3Cscript%3E'),403,'pilot_invalid_category');
  await fails(withQuery('cursor=%2F%2Ftoken'),403,'pilot_invalid_cursor');
});
test('permits bounded product search and pagination', async () => {
  for (const q of [
    'q=fries&page=2&page_size=20',
    'category=Frozen&limit=20',
    'q='+encodeURIComponent('بطاطس')
  ]) {
    assert.equal((await authorizePilotBrowser({...valid(),...withQuery(q)})).permitted,true);
  }
});
test('sends only redacted action status to audit', async () => {
  const events=[];
  await authorizePilotBrowser({
    ...valid(),
    request:{method:'GET',pathname:'/mf-api/products',
      query:new URLSearchParams('q=internal%20secret&business_id=demo-business')},
    audit:async evt=>events.push(evt)
  });
  assert.deepEqual(events,[{action:'pilot_access_allowed',status:200,reason:'read_only'}]);
});
test('product DTO strips cost, price, supplier details and nested private records', () => {
  const publicDto=toPilotPublicProduct({
    id:'FR09',name:'French Fries 9x9',name_ar:'بطاطس',
    unit:'CTN',is_available:true,
    image_url:'https://cdn.example.test/p.png',
    price:46,cost:30,supplier_name:'PRIVATE',margin:12,
    customer_id:'hidden',organization_details:{secret:'nope'},
    line_items:[{cost:100}],token:'SECRET'
  });
  assert.deepEqual({...publicDto},{
    id:'FR09',name:'French Fries 9x9',name_ar:'بطاطس',unit:'CTN',
    image_url:'https://cdn.example.test/p.png',is_available:true
  });
  assert.equal(JSON.stringify(publicDto).includes('PRIVATE'),false);
  assert.equal(Object.isFrozen(publicDto),true);
});
test('product DTO rejects malformed input and missing essential fields', () => {
  for (const obj of [null,[],{id:'a'}, {name:'n'},{id:0,name:'hi'}])
    assert.throws(()=>toPilotPublicProduct(obj),{status:502});
});
test('product DTO drops unsafe or nested image URLs', () => {
  for (const url of [
    'javascript:alert(1)','data:image/svg+xml,test','//untrusted.example/image',
    'https://user@private.example/path',42,{value:'secret'}
  ]) {
    const dto=toPilotPublicProduct({id:'a',name:'Product',image_url:url});
    assert.equal('image_url' in dto,false);
  }
});
test('product DTO drops inherited fields', () => {
  const inherited=Object.create({name:'bad',secret:'yes'});
  inherited.id='A';
  assert.throws(()=>toPilotPublicProduct(inherited),{status:502});
});
