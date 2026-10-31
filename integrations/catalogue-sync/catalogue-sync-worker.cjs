// Deployment target: EXISTING mf_zoho_gateway, Development only.
// Adapter methods are injected from the authenticated gateway's existing Zoho connections.
// Never claim an ACK until destination readback confirms the expected canonical fields.
'use strict';
const DESTINATIONS=new Set(['books','creator','catalyst']);
const APPROVED_FIELDS=new Set(['Product_Name','Translated_Name','Brand','SKU','UPC_Barcode','Unit',
  'Secondary_Unit','Package_Details','Translated_Package','Description',
  'Translated_Description','Country_Of_Origin','Category','Collection1',
  'Make_Product_Available_In_The_Storefront']);
const MAX_ATTEMPTS=5;
const STATUS=new Set(['PENDING','RETRY']);
function selectPatch(text){
 let fields;
 try{fields=typeof text==='string'?JSON.parse(text):text;}catch{throw Error('INVALID_PAYLOAD');}
 if(!fields||typeof fields!=='object'||Array.isArray(fields)||!Object.keys(fields).length)throw Error('INVALID_PAYLOAD');
 for(const [k,v] of Object.entries(fields)){
  if(!APPROVED_FIELDS.has(k))throw Error('DISALLOWED_FIELD');
  if(v!==null&&typeof v!=='string')throw Error('INVALID_FIELD_TYPE');
 }
 return fields;
}
function normalizedCode(e){
 const known=new Set(['REVISION_STALE','DESTINATION_UNAVAILABLE','NATIVE_SYNC_UNVERIFIED',
  'DESTINATION_READBACK_FAILED','INVALID_PAYLOAD','DISALLOWED_FIELD','INVALID_FIELD_TYPE',
  'PRODUCT_UNMAPPED','PROVIDER_REJECTED','TENANT_REJECTED','UNSUPPORTED_DESTINATION']);
 return known.has(String(e?.code||e?.message))?String(e.code||e.message):'PROVIDER_REJECTED';
}
function nextRetry(retryCount,now=Date.now()){
 return new Date(now+Math.min(3600,60*2**Math.min(retryCount,6))*1000).toISOString();
}
async function processProductOutboxRow(row, deps){
 if(!deps||!deps.registry||!deps.transport||!deps.persist)throw Error('Missing gateway adapters');
 if(!row||row.TENANT_KEY!=='menafoods')throw Error('TENANT_REJECTED');
 if(!DESTINATIONS.has(row.DESTINATION))throw Error('UNSUPPORTED_DESTINATION');
 if(!STATUS.has(row.STATUS))return {state:'SKIPPED'};
 const id=String(row.CANONICAL_PRODUCT_ID||'');
 if(!/^menafoods:creator:\d{12,24}$/.test(id))throw Error('PRODUCT_UNMAPPED');
 const rowId=String(row.ROWID||'');
 if(!/^\d+$/.test(rowId))throw Error('PRODUCT_UNMAPPED');
 const fields=selectPatch(row.PAYLOAD_JSON);
 const attempt=Number(row.RETRY_COUNT)||0;
 try{
  const current=await deps.registry.getByCanonical(id);
  if(!current||current.TENANT_KEY!=='menafoods')throw Error('PRODUCT_UNMAPPED');
  if(Number(current.REVISION)>Number(row.REVISION))throw Error('REVISION_STALE');
  if(row.DESTINATION==='books'&&!deps.nativeFinanceSyncVerified)throw Error('NATIVE_SYNC_UNVERIFIED');
  const targetId=row.DESTINATION==='books'?current.BOOKS_ITEM_ID:
     row.DESTINATION==='creator'?current.CREATOR_PRODUCT_ID:
     current.CANONICAL_PRODUCT_ID;
  if(!targetId)throw Error('PRODUCT_UNMAPPED');
  // Transport decides the exact allowed field mapping and uses the *existing*
  // OAuth credentials. It must use GET/compare before write and verify GET
  // readback after write, not treat HTTP 202 or a timeout as applied.
  const receipt=await deps.transport.applyAndVerify(row.DESTINATION,targetId,fields,{
   idempotencyKey:row.IDEMPOTENCY_KEY,rootEventId:row.ROOT_EVENT_ID,revision:row.REVISION});
  if(!receipt||receipt.verified!==true||!receipt.destinationId)throw Error('DESTINATION_READBACK_FAILED');
  await deps.persist.ack(rowId,{
   STATUS:'ACK',ACK_DESTINATION_ID:String(receipt.destinationId).slice(0,180),
   ACK_AT:new Date().toISOString(),ERROR_CODE:''});
  return {state:'ACK',destination:row.DESTINATION};
 }catch(e){
  const retryCount=attempt+1;
  const failure={STATUS:retryCount>=MAX_ATTEMPTS?'DEAD_LETTER':'RETRY',
   RETRY_COUNT:retryCount,ERROR_CODE:normalizedCode(e)};
  if(failure.STATUS==='RETRY')failure.NEXT_ATTEMPT_AT=nextRetry(retryCount);
  await deps.persist.fail(rowId,failure);
  return {state:failure.STATUS,code:failure.ERROR_CODE};
 }
}
module.exports={processProductOutboxRow,selectPatch,nextRetry};
