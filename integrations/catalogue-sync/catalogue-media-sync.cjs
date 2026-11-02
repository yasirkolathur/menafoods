'use strict';
// Staged adapter for existing Catalyst mf_zoho_gateway. Not a deployed service.
// Requires existing tenant auth, Creator OAuth and Stratus SDK adapters injected by gateway.
const {createHash}=require('node:crypto');
const KINDS=new Set(['category','collection']);
const SYSTEMS=new Set(['creator','catalyst']);
const MIME=new Set(['image/jpeg','image/png','image/webp']);
const HEX=/^[a-f\d]{64}$/i, ID=/^\d{12,24}$/;
function reject(code){const e=new Error(code);e.code=code;throw e;}
function validate(event){
 if(!event||event.tenantId!=='menafoods'||!KINDS.has(event.kind))reject('INVALID_ENTITY');
 if(!SYSTEMS.has(event.origin)||!ID.test(String(event.creatorId||'')))reject('INVALID_ID');
 if(event.kind==='collection'&&!ID.test(String(event.categoryCreatorId||'')))reject('PARENT_ID_REQUIRED');
 if(!/^[\w.:-]{8,160}$/.test(String(event.eventId||'')))reject('INVALID_EVENT_ID');
 if(!Number.isSafeInteger(event.revision)||event.revision<0)reject('INVALID_REVISION');
 if(event.sourceAuthenticated!==true||(event.origin==='catalyst'&&event.adminAuthorized!==true))reject('AUTH_REQUIRED');
 if(event.approvalStatus!=='approved'||!ID.test(String(event.approvedById||'')))reject('APPROVAL_REQUIRED');
 const m=event.media;
 if(!m||!MIME.has(m.mime)||!HEX.test(String(m.sha256||'')))reject('INVALID_MEDIA');
 if(!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>5242880||!Number.isSafeInteger(m.width)||!Number.isSafeInteger(m.height)||m.width<320||m.height<320||m.width>4096||m.height>4096)reject('MEDIA_LIMIT');
 if(!['ai_generated','owned','licensed'].includes(m.rightsType)||m.rightsConfirmed!==true)reject('RIGHTS_UNVERIFIED');
 if(m.illustrative!==(m.rightsType==='ai_generated'))reject('ILLUSTRATION_LABEL_REQUIRED');
 // Only scoped Creator image-field URLs or existing Catalyst Stratus object keys.
 // No arbitrary HTTP URL, third-party fetch, name match, or public binary.
 const id=String(event.creatorId), sha=m.sha256.toLowerCase();
 if(event.origin==='creator'){
  const report=event.kind==='category'?'All_Categories1':'All_Collections';
  const prefix='/api/v2.1/menafoods/mena/report/'+report+'/'+id+'/Image/download?filepath=';
  if(typeof m.locator!=='string'||!m.locator.startsWith(prefix)||!/^[\w.-]{1,220}$/.test(m.locator.slice(prefix.length)))reject('UNSAFE_SOURCE');
 }else{
  const exact=new RegExp('^catalogue-media/'+event.kind+'/'+id+'/'+sha+'\\.(webp|png|jpg)$');
  if(typeof m.locator!=='string'||!exact.test(m.locator))reject('UNSAFE_SOURCE');
 }
 return {...event,creatorId:id,media:{...m,sha256:sha}};
}
function entityKey(e){return 'menafoods:'+e.kind+':'+e.creatorId;}
function target(e){return e.origin==='creator'?'catalyst':'creator';}
function eventKey(e){
 return createHash('sha256').update(JSON.stringify({entity:entityKey(e),origin:e.origin,event:e.rootEventId||e.eventId,revision:e.revision,hash:e.media.sha256})).digest('hex');
}
// Existing MF_Product_Sync_Outbox must be migrated to store category/collection entity kinds
// before deploying; do not write category rows into current PRODUCT-only schema.
async function enqueueApprovedMedia(raw,{registry,outbox,validateCreatorEntity}){
 const e=validate(raw);if(!registry||!outbox||typeof validateCreatorEntity!=='function')reject('ADAPTER_REQUIRED');
 await validateCreatorEntity(e.kind,e.creatorId,e.categoryCreatorId);
 const key=eventKey(e),ent=entityKey(e);
 return outbox.transaction(async tx=>{
  if(await tx.hasIdempotencyKey(key))return {status:'already_processed',key};
  const existing=await registry.getEntity(ent);
  if(!existing||existing.tenantId!=='menafoods'||existing.revision!==e.revision)reject('REVISION_CONFLICT');
  if(existing.mediaSha256===e.media.sha256)return {status:'unchanged',key};
  await tx.enqueue({tenantId:'menafoods',entityKind:e.kind,entityId:ent,creatorId:e.creatorId,categoryCreatorId:e.categoryCreatorId||null,source:e.origin,destination:target(e),media:e.media,rootEventId:e.rootEventId||e.eventId,expectedRevision:e.revision,idempotencyKey:key,status:'PENDING',retryCount:0});
  await tx.markIdempotencyKey(key);
  return {status:'queued',key,destination:target(e)};
 });
}
async function processMediaOutbox(row,{fetchAuthenticatedBytes,putAndVerify,ack,fail}){
 if(!row||row.tenantId!=='menafoods'||!KINDS.has(row.entityKind)||!SYSTEMS.has(row.destination)||row.source===row.destination)reject('BAD_ROW');
 if(!['PENDING','RETRY'].includes(row.status))return {status:'skipped'};
 try{
  const content=await fetchAuthenticatedBytes(row.source,row.media.locator);
  if(!Buffer.isBuffer(content)||content.length!==row.media.bytes||createHash('sha256').update(content).digest('hex')!==row.media.sha256)reject('CHECKSUM_MISMATCH');
  // putAndVerify MUST check source revision, upload using existing OAuth/Stratus,
  // re-read destination bytes and return exact SHA-256. HTTP success alone is insufficient.
  const receipt=await putAndVerify(row.destination,row.creatorId,content,row);
  if(receipt?.verified!==true||receipt?.sha256!==row.media.sha256)reject('READBACK_FAILED');
  await ack(row.idempotencyKey,receipt);
  return {status:'ACK',destination:row.destination};
 }catch(err){
  const retries=(row.retryCount||0)+1,status=retries>=5?'DEAD_LETTER':'RETRY';
  await fail(row.idempotencyKey,{status,retries,errorCode:['CHECKSUM_MISMATCH','READBACK_FAILED'].includes(err.code)?err.code:'TRANSPORT_FAILED',retryAfterSeconds:status==='RETRY'?Math.min(3600,60*2**retries):null});
  return {status};
 }
}
module.exports={validate,entityKey,eventKey,enqueueApprovedMedia,processMediaOutbox};
