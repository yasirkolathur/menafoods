import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPage,checkDevelopmentCatalogue,DEV_ORIGIN} from '../scripts/dev-catalogue-contract.mjs';

const item=(overrides={})=>({product_id:'p1',status:'active',show_in_storefront:true,can_process_in_storefront:true,...overrides});
const page=(n,items,hasMore=false)=>({ok:true,result:{products:items,page_context:{page:n,has_more_page:hasMore}}});
const mockFetch=pages=>async(url,options)=>{
  assert.ok(url.startsWith(DEV_ORIGIN+'/mf-api/mobile/catalog/products?'));
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const n=Number(new URL(url).searchParams.get('page'));
  return {ok:true,status:200,json:async()=>pages[n-1]};
};
test('accepts complete approved page',()=>assert.deepEqual(inspectPage(page(1,[item()]),1).problems,[]));
test('rejects hidden storefront product boolean and string values',()=>{
  assert.match(inspectPage(page(1,[item({show_in_storefront:false})]),1).problems.join(' '),/non-storefront/);
  assert.match(inspectPage(page(1,[item({show_in_storefront:'false'})]),1).problems.join(' '),/non-storefront/);
});
test('rejects invisible variants and inactive/draft statuses',()=>{
  assert.match(inspectPage(page(1,[item({variants:[{can_process_in_storefront:0}]})]),1).problems.join(' '),/non-storefront/);
  assert.match(inspectPage(page(1,[item({status:'draft'})]),1).problems.join(' '),/inactive/);
});
test('detects supplier purchase cost in product or variant',()=>{
  assert.match(inspectPage(page(1,[item({purchase_rate:100})]),1).problems.join(' '),/cost/);
  assert.match(inspectPage(page(1,[item({variants:[{supplier_cost:10}]})]),1).problems.join(' '),/cost/);
});
test('rejects empty page claiming additional pages',()=>{
  assert.match(inspectPage(page(2,[],true),2).problems.join(' '),/empty page/);
});
test('rejects wrong page context and partial flags',()=>{
  const x=page(1,[item()]);x.partial_catalogue=true;
  assert.ok(inspectPage(x,2).problems.length>=2);
});
test('invalid response fails closed without echoing upstream details',()=>{
  const y=inspectPage({ok:false,error:'credential-secret-here'},1);
  assert.deepEqual(y.problems,['page 1: invalid public catalogue response']);
});
test('successful multi-page audit only sends bounded GET',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([page(1,[item()],true),page(2,[item({product_id:'p2'})])])});
  assert.equal(r.ok,true);assert.equal(r.pagesChecked,2);assert.equal(r.rowsChecked,2);
});
test('repeated product ID across pages is a failure',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([page(1,[item()],true),page(2,[item()])])});
  assert.equal(r.ok,false);assert.match(r.issues.join(' '),/repeated product/);
});
test('stop after no more pages',async()=>{
  let calls=0;const r=await checkDevelopmentCatalogue({fetchFn:async()=>{
    calls++;return {ok:true,json:async()=>page(1,[item()],false)};
  }});
  assert.equal(r.ok,true);assert.equal(calls,1);
});
test('audit bounds disallow unbounded scraping',async()=>{
  await assert.rejects(()=>checkDevelopmentCatalogue({maxPages:11}),RangeError);
  await assert.rejects(()=>checkDevelopmentCatalogue({perPage:500}),RangeError);
});
test('HTTP failures return a safe failing report',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:async()=>({ok:false,status:502})});
  assert.equal(r.ok,false);assert.deepEqual(r.issues,['page 1: HTTP 502']);
});
test('request failures are redacted',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:async()=>{throw Error('bearer abc password')}});
  assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('bearer'));
});
