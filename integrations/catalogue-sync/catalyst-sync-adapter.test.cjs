const test=require('node:test');
const assert=require('node:assert/strict');
const {readRegistry,readByBooksId,enqueueApprovedProductPatch,registryPublicSummary,selectUpdates}=require('./catalyst-sync-adapter.cjs');
function makeSdk(){
 const inserts=[];
 const record={CANONICAL_PRODUCT_ID:'menafoods:creator:4278439000001256016',
 CREATOR_PRODUCT_ID:'4278439000001256016',BOOKS_ITEM_ID:'4886172000000143906',
 REVISION:0,SYNC_STATUS:'BASELINE_UNVERIFIED'};
 return {inserts,app:{
  zcql(){return {async executeZCQLQuery(q){
   if(q.includes('CREATOR_PRODUCT_ID'))return [{MF_Product_Sync_Registry:record}];
   if(q.includes('BOOKS_ITEM_ID'))return [{MF_Product_Sync_Registry:record}];
   throw Error('Bad SQL');
  }}},
  datastore(){return {table(name){assert.equal(name,'MF_Product_Sync_Outbox');
   return {insertRow:async row=>{inserts.push(row);return {...row,ROWID:String(inserts.length)}}}}}}
 }};
}
test('safe exact-ID read and public registry projection',async()=>{
 const {app}=makeSdk();
 const x=await readRegistry(app,'4278439000001256016');
 assert.equal(x.BOOKS_ITEM_ID,'4886172000000143906');
 assert.equal((await readByBooksId(app,x.BOOKS_ITEM_ID)).CREATOR_PRODUCT_ID,x.CREATOR_PRODUCT_ID);
 assert.equal(registryPublicSummary(x).sync_status,'BASELINE_UNVERIFIED');
 await assert.rejects(()=>readRegistry(app,"' OR 1=1 --"),/verified Zoho/);
});
test('rejects cost, margin, hidden finance information in product patch',()=>{
 assert.throws(()=>selectUpdates({Base_Price:'100'}),/Unapproved/);
 assert.throws(()=>selectUpdates({Purchase_Rate:'500'}),/Unapproved/);
 assert.throws(()=>selectUpdates({Supplier_ID:'1'}),/Unapproved/);
 assert.deepEqual(selectUpdates({Brand:'  New Brand '}),{Brand:'New Brand'});
});
test('refuses to write without admin, verified native sync, revision',async()=>{
 const {app,inserts}=makeSdk();
 const input={tenantId:'menafoods',adminAuthorized:true,origin:'creator',
 creatorProductId:'4278439000001256016',expectedRevision:0,rootEventId:'crm.change:123456',fields:{Brand:'Test'}};
 await assert.rejects(()=>enqueueApprovedProductPatch(app,{...input,adminAuthorized:false},{nativeFinanceSyncVerified:true}),/Admin/);
 await assert.rejects(()=>enqueueApprovedProductPatch(app,input),/Verify Books/);
 await assert.rejects(()=>enqueueApprovedProductPatch(app,{...input,expectedRevision:10},{nativeFinanceSyncVerified:true}),/Revision/);
 assert.equal(inserts.length,0);
});
test('queues only Books and Catalyst when native finance link confirmed',async()=>{
 const {app,inserts}=makeSdk();
 const input={tenantId:'menafoods',adminAuthorized:true,origin:'creator',
 creatorProductId:'4278439000001256016',expectedRevision:0,rootEventId:'crm.change:123456',fields:{Brand:'Test'}};
 const out=await enqueueApprovedProductPatch(app,input,{nativeFinanceSyncVerified:true});
 assert.deepEqual(out.destinations,['books','catalyst']);
 assert.deepEqual(inserts.map(x=>x.DESTINATION),['books','catalyst']);
 assert.equal(inserts[0].STATUS,'PENDING');
 assert.equal(inserts[0].PAYLOAD_JSON,'{"Brand":"Test"}');
});
