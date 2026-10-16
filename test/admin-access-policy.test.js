import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeAdminAction} from '../src/api/lib/admin-access-policy.js';

const valid = {
  sessionToken:'opaque', businessId:'mf-business', action:'admin.dashboard.read',
  verifySession: async () => ({id:'user-1'}),
  lookupMemberships: async () => [{businessId:'mf-business',role:'ADMIN',status:'ACTIVE',grants:[]}]
};
const call = overrides => authorizeAdminAction({...valid,...overrides});
const rejects = (promise,status,reason) => assert.rejects(promise,e=>e.status===status&&e.message===reason);

test('permits exact scoped admin read',async()=>{
  assert.deepEqual(await call(),{userId:'user-1',businessId:'mf-business',role:'ADMIN',action:'admin.dashboard.read',write:false});
});
test('rejects unsupported and financial operation before session verification',async()=>{
  let calls=0;
  await rejects(call({action:'admin.finops.payment.release',verifySession:async()=>{calls++;return {id:'user-1'}}}),403,'operation_forbidden');
  assert.equal(calls,0);
});
test('fails closed if server-side verifiers absent',async()=>{
  await rejects(call({lookupMemberships:null}),503,'authorization_unavailable');
});
test('requires opaque session',async()=>{
  await rejects(call({sessionToken:''}),401,'authentication_required');
});
test('rejects missing scope',async()=>{
  await rejects(call({businessId:''}),403,'business_scope_required');
});
test('rejects invalid session',async()=>{
  await rejects(call({verifySession:async()=>null}),401,'authentication_required');
});
test('redacts verifier failure details and session token',async()=>{
  const token='secret-do-not-echo';
  await rejects(call({sessionToken:token,verifySession:async()=>{throw Error(token)}}),401,'authentication_required');
});
test('rejects absent membership',async()=>{
  await rejects(call({lookupMemberships:async()=>[]}),403,'permission_denied');
});
test('rejects non-array membership response (fails closed)',async()=>{
  await rejects(call({lookupMemberships:async()=>null}),503,'authorization_unavailable');
});
test('rejects membership store outage without leaking provider error',async()=>{
  await rejects(call({lookupMemberships:async()=>{throw Error('db internal')}}),503,'authorization_unavailable');
});
test('blocks wrong business even for owner',async()=>{
  await rejects(call({businessId:'other-business',lookupMemberships:async()=>[{businessId:'mf-business',role:'OWNER',status:'ACTIVE',grants:['admin.products.approve']}]}),403,'permission_denied');
});
test('blocks inactive admin',async()=>{
  await rejects(call({lookupMemberships:async()=>[{businessId:'mf-business',role:'ADMIN',status:'REVOKED',grants:[]}]}),403,'permission_denied');
});
test('blocks customer with client-forged role/grants',async()=>{
  await rejects(call({role:'OWNER',grants:['admin.products.approve'],lookupMemberships:async()=>[{businessId:'mf-business',role:'CUSTOMER',status:'ACTIVE',grants:['admin.products.approve']}],action:'admin.products.approve'}),403,'permission_denied');
});
test('read action requires neither write grant nor browser hint',async()=>{
  const r=await call({action:'admin.integrations.read'});assert.equal(r.write,false);
});
test('write denies admin without explicit trusted grant',async()=>{
  await rejects(call({action:'admin.products.approve'}),403,'permission_denied');
});
test('write denies owner without explicit trusted grant',async()=>{
  await rejects(call({action:'admin.products.approve',lookupMemberships:async()=>[{businessId:'mf-business',role:'OWNER',status:'ACTIVE',grants:[]}]}),403,'permission_denied');
});
test('write allows explicit trusted scoped grant and returns immutable decision',async()=>{
  const r=await call({action:'admin.products.approve',lookupMemberships:async()=>[{businessId:'mf-business',role:'ADMIN',status:'ACTIVE',grants:['admin.products.approve']} ]});
  assert.equal(r.write,true);assert.equal(Object.isFrozen(r),true);
});
test('write requires exact grant name, not wildcard or prefix',async()=>{
  await rejects(call({action:'admin.products.approve',lookupMemberships:async()=>[{businessId:'mf-business',role:'ADMIN',status:'ACTIVE',grants:['admin.*']}]}),403,'permission_denied');
});
