const test=require('node:test');
const assert=require('node:assert/strict');
const {processProductOutboxRow,selectPatch,nextRetry}=require('./catalogue-sync-worker.cjs');
const base={ROWID:'17990000000484044',TENANT_KEY:'menafoods',CANONICAL_PRODUCT_ID:'menafoods:creator:4278439000001256016',
 SOURCE_SYSTEM:'creator',DESTINATION:'books',REVISION:1,ROOT_EVENT_ID:'creator.updated.1',STATUS:'PENDING',RETRY_COUNT:0,
 IDEMPOTENCY_KEY:'test-key',PAYLOAD_JSON:'{"Brand":"Test"}'};
const registry={getByCanonical:async()=>({TENANT_KEY:'menafoods',CANONICAL_PRODUCT_ID:base.CANONICAL_PRODUCT_ID,
 REVISION:1,BOOKS_ITEM_ID:'4886172000000143906',CREATOR_PRODUCT_ID:'4278439000001256016'})};
test('worker accepts approved metadata, refuses purchase cost',()=>{
 assert.deepEqual(selectPatch(base.PAYLOAD_JSON),{Brand:'Test'});
 assert.throws(()=>selectPatch('{"Base_Price":"10"}'),/DISALLOWED_FIELD/);
});
test('does not deliver if finance native link not verified',async()=>{
 let writes=0,failed=[];
 const v=await processProductOutboxRow(base,{registry,nativeFinanceSyncVerified:false,
 transport:{applyAndVerify:async()=>{writes++}},
 persist:{ack:async()=>{},fail:async(_id,x)=>failed.push(x)}});
 assert.equal(writes,0);assert.equal(v.code,'NATIVE_SYNC_UNVERIFIED');
 assert.equal(failed[0].STATUS,'RETRY');
});
test('ACK is only after successful independent readback',async()=>{
 const a=[];const t=[];const result=await processProductOutboxRow(base,{
  registry,nativeFinanceSyncVerified:true,
  transport:{applyAndVerify:async(dest,id,fields)=>{t.push({dest,id,fields});return {verified:true,destinationId:id}}},
  persist:{ack:async(_id,x)=>a.push(x),fail:async()=>{throw Error('should not fail')}}
 });
 assert.equal(result.state,'ACK');assert.equal(t[0].id,'4886172000000143906');
 assert.equal(a[0].STATUS,'ACK');
});
test('fails closed and dead-letters after maximum retries',async()=>{
 const fail=[];const res=await processProductOutboxRow({...base,RETRY_COUNT:4},{registry,
 nativeFinanceSyncVerified:true,transport:{applyAndVerify:async()=>{throw Error('leaking upstream token')}},
 persist:{ack:async()=>{},fail:async(_id,x)=>fail.push(x)}});
 assert.equal(res.state,'DEAD_LETTER');assert.equal(res.code,'PROVIDER_REJECTED');
 assert.equal(JSON.stringify(res).includes('token'),false);
});
test('stale event cannot overwrite a newer revision',async()=>{
 let transportCalls=0;const res=await processProductOutboxRow(base,{
 registry:{getByCanonical:async()=>({...await registry.getByCanonical(),REVISION:2})},
 nativeFinanceSyncVerified:true,transport:{applyAndVerify:async()=>{transportCalls++}},
 persist:{ack:async()=>{},fail:async()=>{}}
 });assert.equal(res.code,'REVISION_STALE');assert.equal(transportCalls,0);
});
test('backoff is monotonic',()=>assert.ok(nextRetry(2,0)<nextRetry(3,0)));
