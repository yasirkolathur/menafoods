// Existing Catalyst gateway integration adapter — staged only (never a separate server).
// Zoho Books/Inventory/Commerce may share native two-way sync. Do not fan-out
// into both Books and Commerce unless the native relationship is independently verified disabled.
'use strict';
const crypto=require('node:crypto');
const REGISTRY='MF_Product_Sync_Registry';
const OUTBOX='MF_Product_Sync_Outbox';
const PROVIDERS=new Set(['creator','books','inventory','commerce','catalyst']);
const PUBLIC_FIELDS=new Set(['Product_Name','Translated_Name','Brand','SKU','UPC_Barcode','Unit',
  'Secondary_Unit','Package_Details','Translated_Package','Description',
  'Translated_Description','Country_Of_Origin','Category','Collection1',
  'Make_Product_Available_In_The_Storefront']);
function assertId(v,label) {
  v=String(v??'').trim();
  if(!/^\d{12,24}$/.test(v)) throw Error(label+' must be a verified Zoho numeric ID');
  return v;
}
function tenant(t) {
  if(t!=='menafoods') throw Error('Invalid tenant');
  return t;
}
function rowIdentity(id) {
  return 'menafoods:creator:'+assertId(id,'Creator ID');
}
function sqlQuote(v) {
  return String(v).replaceAll("'","''");
}
function unpack(result,table) {
  return (Array.isArray(result)?result:[]).map(r=>r?.[table]||r);
}
async function readRegistry(app,creatorId) {
  const id=assertId(creatorId,'Creator ID');
  const q="SELECT * FROM "+REGISTRY+
    " WHERE TENANT_KEY='menafoods' AND CREATOR_PRODUCT_ID='"+sqlQuote(id)+"' LIMIT 0,2";
  const rows=unpack(await app.zcql().executeZCQLQuery(q),REGISTRY);
  if(rows.length>1) throw Error('Duplicate canonical identity; quarantine');
  return rows[0]||null;
}
async function readByBooksId(app,booksId) {
  const id=assertId(booksId,'Books item ID');
  const q="SELECT * FROM "+REGISTRY+
    " WHERE TENANT_KEY='menafoods' AND BOOKS_ITEM_ID='"+sqlQuote(id)+"' LIMIT 0,2";
  const rows=unpack(await app.zcql().executeZCQLQuery(q),REGISTRY);
  if(rows.length>1) throw Error('Books item ID collision; quarantine');
  return rows[0]||null;
}
function selectUpdates(fields) {
  if(!fields||typeof fields!=='object'||Array.isArray(fields)) throw Error('Missing product patch');
  const entries=Object.entries(fields);
  if(!entries.length) throw Error('Empty patch');
  const selected={};
  for(const [key,val] of entries) {
    if(!PUBLIC_FIELDS.has(key)) throw Error('Unapproved product field: '+key);
    if(val!==null && typeof val!=='string') throw Error('Invalid product value type');
    const value=typeof val==='string'?val.trim():val;
    if(typeof value==='string' && value.length>2000) throw Error('Field too long');
    selected[key]=value;
  }
  return selected;
}
/**
 * Admin-authentication MUST happen in the existing route handler before calling this.
 * Enqueues only; no direct Books/Commerce writes. Worker validates current item/ETag and
 * executes exactly one Finance write. The finance apps' native sync does the remaining fanout.
 */
async function enqueueApprovedProductPatch(app,input,{nativeFinanceSyncVerified=false}={}) {
  if(!input || input.adminAuthorized!==true) throw Error('Admin authorization required');
  if(!nativeFinanceSyncVerified) throw Error('Verify Books/Inventory/Commerce native link before enabling writes');
  tenant(input.tenantId);
  const origin=String(input.origin||'').toLowerCase();
  if(!PROVIDERS.has(origin)) throw Error('Invalid event origin');
  const registry=await readRegistry(app,input.creatorProductId);
  if(!registry) throw Error('Product not mapped; do not create by fuzzy name');
  if(!registry.BOOKS_ITEM_ID) throw Error('Verified Books item ID missing');
  await readByBooksId(app,registry.BOOKS_ITEM_ID);
  const fields=selectUpdates(input.fields);
  if(!Number.isSafeInteger(input.expectedRevision) || Number(registry.REVISION)!==input.expectedRevision) {
    throw Error('Revision conflict; reconcile before retry');
  }
  const rootEventId=String(input.rootEventId||'').trim();
  if(!/^[A-Za-z0-9_.:-]{6,160}$/.test(rootEventId)) throw Error('A safe rootEventId is required');
  const destinations=origin==='creator'?['books','catalyst']:
    ['books','inventory','commerce'].includes(origin)?['creator','catalyst']:['creator','books'];
  const canonical=rowIdentity(input.creatorProductId);
  if(registry.CANONICAL_PRODUCT_ID!==canonical) throw Error('Identity mismatch');
  const result=[];
  const digest=crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0,32);
  for(const destination of destinations) {
    const idempotencyKey=['menafoods',rootEventId,canonical,destination,digest].join(':');
    if(idempotencyKey.length>255) throw Error('Idempotency key too long');
    // Insert must be unique by IDEMPOTENCY_KEY; replay needs a read/409 handling
    // in the worker, never blindly overwrite another event payload.
    const row={TENANT_KEY:'menafoods',IDEMPOTENCY_KEY:idempotencyKey,
      CANONICAL_PRODUCT_ID:canonical,ROOT_EVENT_ID:rootEventId,
      SOURCE_SYSTEM:origin,DESTINATION:destination,REVISION:input.expectedRevision+1,
      STATUS:'PENDING',RETRY_COUNT:0,PAYLOAD_JSON:JSON.stringify(fields)};
    result.push(await app.datastore().table(OUTBOX).insertRow(row));
  }
  // A crash between two inserts is repaired by deterministic idempotency keys
  // and the worker's outbox reconciler, not treated as an atomic transaction.
  return {ok:true,queued:result.length,destinations,canonical_product_id:canonical};
}
function registryPublicSummary(row) {
  if(!row) return null;
  return {canonical_product_id:row.CANONICAL_PRODUCT_ID,
    creator_product_id:row.CREATOR_PRODUCT_ID,books_item_id:row.BOOKS_ITEM_ID||null,
    commerce_product_id:row.COMMERCE_PRODUCT_ID||null,
    sync_status:row.SYNC_STATUS,revision:Number(row.REVISION)||0};
}
module.exports={REGISTRY,OUTBOX,readRegistry,readByBooksId,enqueueApprovedProductPatch,registryPublicSummary,selectUpdates};
