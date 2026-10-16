import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePilotBrowser } from '../src/api/lib/pilot-browser-policy.js';

const target = { projectId:'17990000000237407', projectName:'menafoodscustomermiddleware', environment:'Development' };
const membership = { userId:'pilot-user', role:'PILOT_AI_AGENT', status:'ACTIVE', readOnly:true, businessId:'demo-business' };
const good = () => ({
  session:{userId:'pilot-user',verified:true},
  request:{method:'GET',pathname:'/mf-api/products',query:new URLSearchParams('business_id=demo-business')},
  target,lookupMembership:async()=>membership,audit:async()=>{}
});
const error = (overrides,status,reason) =>
  assert.rejects(authorizePilotBrowser({...good(),...overrides}),e=>e.status===status&&e.message===reason);

test('allows one trusted, scoped, authenticated Development GET',async()=>{
  const v=await authorizePilotBrowser(good());
  assert.equal(v.businessId,'demo-business');
  assert.equal(v.readOnly,true);
  assert.equal(v.permitted,true);
});
test('denies absent session',()=>error({session:null},401,'authenticated_pilot_session_required'));
test('denies fake client-provided pilot flag',()=>error({session:{userId:'pilot-user',role:'PILOT_AI_AGENT'}},401,'authenticated_pilot_session_required'));
test('denies ordinary App User role',()=>error({lookupMembership:async()=>({...membership,role:'App User'})},403,'pilot_membership_not_approved'));
test('denies unconfirmed or disabled membership',()=>error({lookupMembership:async()=>({...membership,status:'INVITED'})},403,'pilot_membership_not_approved'));
test('denies membership substitution across user IDs',()=>error({lookupMembership:async()=>({...membership,userId:'other-user'})},403,'pilot_membership_not_approved'));
test('denies all financial write methods',async()=>{
  for(const method of ['POST','PUT','PATCH','DELETE'])
    await error({request:{method,pathname:'/mf-api/products'}},405,'pilot_read_only');
});
test('denies Admin, wallet, orders and secret routes',async()=>{
  for(const pathname of ['/mf-api/admin','/mf-api/orders','/mf-api/wallet','/mf-api/finops/credit/decision','/mf-api/product/%2e%2e/admin'])
    await error({request:{method:'GET',pathname}},403,'pilot_route_not_allowlisted');
});
test('denies cross-business query scope',()=>error({request:{method:'GET',pathname:'/mf-api/products',query:new URLSearchParams('business_id=other')}},403,'pilot_business_scope_mismatch'));
test('denies customer/supplier and role ID queries',async()=>{
  for(const query of ['customer_id=99','supplier-id=10','role=Owner','token=example'])
    await error({request:{method:'GET',pathname:'/mf-api/products',query:new URLSearchParams(query)}},403,'pilot_query_forbidden');
});
test('denies Production and other project',async()=>{
  await error({target:{...target,environment:'Production'}},403,'development_only');
  await error({target:{...target,projectId:'other'}},403,'project_not_allowed');
});
test('refuses missing trusted providers',()=>error({lookupMembership:undefined},503,'pilot_guard_not_configured'));
test('never sends tokens or query strings to audit sink',async()=>{
  const events=[];
  await authorizePilotBrowser({...good(),request:{method:'GET',pathname:'/mf-api/products',query:new URLSearchParams('q=fries&business_id=demo-business')},audit:async event=>events.push(event)});
  assert.deepEqual(events,[{action:'pilot_access_allowed',status:200,reason:'read_only'}]);
});
test('supports approved health, categories, bootstrap, product details',async()=>{
  for(const pathname of ['/mf-api/health','/mf-api/categories','/mf-api/bootstrap','/mf-api/products/FR09']){
    const v=await authorizePilotBrowser({...good(),request:{method:'HEAD',pathname}});
    assert.equal(v.permitted,true);
  }
});
