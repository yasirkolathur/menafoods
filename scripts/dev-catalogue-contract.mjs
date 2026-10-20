/**
 * MENAFoods Catalyst Development: read-only public catalogue release gate.
 * No credentials, authenticated calls, customer fields, or writes.
 */
import {pathToFileURL} from 'node:url';

export const DEV_ORIGIN='https://menafoodscustomermiddleware-809407193.development.catalystserverless.com';
const BAD_STATUSES=new Set(['inactive','archived','deleted','draft','disabled']);
const PRIVATE_FIELDS=new Set([
  'purchase_rate','purchase_price','cost_price','cost','purchase_cost',
  'supplier_cost','supplier_price','supplier_id','supplier_name','vendor_id',
  'vendor_name','vendor_rate','last_purchase_rate','last_purchase_price',
  'wholesale_cost','cost_of_goods_sold','base_cost'
]);
const falseLike=v=>v===false||v===0||(typeof v==='string'&&['false','0','no'].includes(v.toLowerCase()));
const trueLike=v=>v===true||v===1||(typeof v==='string'&&['true','1','yes'].includes(v.toLowerCase()));
const isHidden=x=>x&&typeof x==='object'&&(
  falseLike(x.show_in_storefront)||falseLike(x.can_process_in_storefront)||
  falseLike(x.is_active)||BAD_STATUSES.has(String(x.status||'').toLowerCase())
);
function hasPrivateField(x){
  if(!x||typeof x!=='object')return false;
  if(Object.keys(x).some(k=>PRIVATE_FIELDS.has(k.toLowerCase())))return true;
  return Array.isArray(x.variants)&&x.variants.some(v=>v&&Object.keys(v).some(k=>PRIVATE_FIELDS.has(k.toLowerCase())));
}
export function inspectPage(payload,page){
  const problems=[],result=payload?.result,rows=result?.products;
  if(payload?.ok!==true||!Array.isArray(rows)){
    return {problems:[`page ${page}: invalid public catalogue response`],ids:[],rows:0,hasMore:false,totalCount:null};
  }
  const ctx=result?.page_context;
  if(!ctx||Number(ctx.page)!==page)problems.push(`page ${page}: inconsistent page index`);
  const hasMore=trueLike(ctx?.has_more_page);
  if(!hasMore&&!falseLike(ctx?.has_more_page))problems.push(`page ${page}: has_more_page missing or invalid`);
  const rawTotal=result?.total_count??ctx?.total_count??payload?.total_count;
  const parsedTotal=Number(rawTotal);
  const totalCount=rawTotal==null||!Number.isSafeInteger(parsedTotal)||parsedTotal<0?null:parsedTotal;
  if(totalCount===null)problems.push(`page ${page}: total_count missing or invalid`);
  if(hasMore&&rows.length===0)problems.push(`page ${page}: empty page with has_more_page=true`);
  let hidden=0,privateFields=0;
  const ids=[],localIds=new Set();
  for(const row of rows){
    const id=String(row?.product_id??row?.item_id??row?.id??'').trim();
    if(!id)problems.push(`page ${page}: product without a stable ID`);
    else if(localIds.has(id))problems.push(`page ${page}: duplicate product ID within page`);
    else{ids.push(id);localIds.add(id)}
    if(isHidden(row)||(Array.isArray(row?.variants)&&row.variants.some(isHidden)))hidden++;
    if(hasPrivateField(row))privateFields++;
  }
  if(hidden)problems.push(`page ${page}: ${hidden} non-storefront or inactive product/variant rows exposed`);
  if(privateFields)problems.push(`page ${page}: ${privateFields} row(s) expose supplier/purchase-cost fields`);
  if(payload.partial_catalogue===true||ctx?.pagination_inconsistent===true){
    problems.push(`page ${page}: upstream catalogue explicitly marked partial/inconsistent`);
  }
  return {problems,ids,rows:rows.length,hasMore,totalCount};
}
/** fetchFn override is only intended for unit tests; runtime URL is fixed. */
export async function checkDevelopmentCatalogue({fetchFn=globalThis.fetch,maxPages=25,perPage=100,expectedTotalCount=null}={}){
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>25||!Number.isInteger(perPage)||perPage<1||perPage>100||
     (expectedTotalCount!==null&&(!Number.isSafeInteger(expectedTotalCount)||expectedTotalCount<0))){
    throw new RangeError('bounded read-only audit parameters required');
  }
  const issues=[],seen=new Set();let inspected=0,rows=0,completed=false,reportedTotalCount=null;
  for(let page=1;page<=maxPages;page++){
    const url=new URL('/mf-api/mobile/catalog/products',DEV_ORIGIN);
    url.searchParams.set('page',String(page));
    url.searchParams.set('per_page',String(perPage));
    let payload;
    try{
      const response=await fetchFn(url.toString(),{
        method:'GET',headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){issues.push(`page ${page}: HTTP ${response.status}`);break;}
      payload=await response.json();
    }catch{issues.push(`page ${page}: request failed or returned invalid JSON`);break;}
    inspected++;
    const inspectedPage=inspectPage(payload,page);
    rows+=inspectedPage.rows;issues.push(...inspectedPage.problems);
    if(inspectedPage.rows>perPage)issues.push(`page ${page}: more rows than requested per_page`);
    if(inspectedPage.totalCount!==null){
      if(reportedTotalCount===null)reportedTotalCount=inspectedPage.totalCount;
      else if(reportedTotalCount!==inspectedPage.totalCount)issues.push(`page ${page}: total_count changed between pages`);
    }
    for(const id of inspectedPage.ids){
      if(seen.has(id))issues.push(`page ${page}: repeated product ID across pages`);
      seen.add(id);
    }
    if(!inspectedPage.hasMore){completed=true;break;}
    if(page===maxPages)issues.push(`page ${page}: audit page limit reached before final page`);
  }
  if(completed&&reportedTotalCount!==null&&seen.size!==reportedTotalCount){
    issues.push(`incomplete catalogue: reported total_count ${reportedTotalCount} differs from ${seen.size} unique IDs`);
  }
  if(expectedTotalCount!==null&&reportedTotalCount!==expectedTotalCount){
    issues.push(`expected catalogue count ${expectedTotalCount} not confirmed`);
  }
  return {ok:issues.length===0&&completed,pagesChecked:inspected,rowsChecked:rows,uniqueProducts:seen.size,reportedTotalCount,completed,issues};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await checkDevelopmentCatalogue();
  // Never log product names, IDs, records, customer data or credentials.
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}
