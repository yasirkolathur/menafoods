import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPage,checkDevelopmentCatalogue,DEV_ORIGIN} from '../scripts/dev-catalogue-contract.mjs';

const item=(overrides={})=>({product_id:'p1',status:'active',show_in_storefront:true,can_process_in_storefront:true,...overrides});
const page=(n,items,hasMore=false,total=items.length)=>({ok:true,result:{products:items,total_count:total,page_context:{page:n,has_more_page:hasMore}}});
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
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([page(1,[item()],true,2),page(2,[item({product_id:'p2'})],false,2)])});
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
  await assert.rejects(()=>checkDevelopmentCatalogue({maxPages:26}),RangeError);
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

test('audits all 1,272 products through page 13 and validates the final 72 records',async()=>{
  const pages=Array.from({length:13},(_,i)=>{
    const len=i===12?72:100;
    return page(i+1,Array.from({length:len},(_,j)=>item({product_id:'prod-'+(i*100+j+1)})),i<12,1272);
  });
  let calls=0;
  const base=mockFetch(pages);
  const r=await checkDevelopmentCatalogue({fetchFn:async(...args)=>{calls++;return base(...args)},expectedTotalCount:1272});
  assert.equal(r.ok,true);assert.equal(r.completed,true);assert.equal(calls,13);
  assert.equal(r.pagesChecked,13);assert.equal(r.uniqueProducts,1272);
  assert.equal(r.rowsChecked,1272);assert.equal(r.reportedTotalCount,1272);
});
test('fails closed when maximum page reached while further pages advertised',async()=>{
  const pages=[page(1,[item()],true,3),page(2,[item({product_id:'p2'})],true,3)];
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch(pages),maxPages:2});
  assert.equal(r.ok,false);assert.equal(r.completed,false);
  assert.match(r.issues.join(' '),/page limit reached/);
});
test('detects repeated IDs within a page and missing product identifiers',()=>{
  const r=inspectPage(page(1,[item(),item(),{status:'active',show_in_storefront:true}]),1);
  assert.match(r.problems.join(' '),/duplicate product ID within page/);
  assert.match(r.problems.join(' '),/without a stable ID/);
});
test('detects inconsistent total counts across pages',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([
    page(1,[item()],true,2),
    page(2,[item({product_id:'p2'})],false,200)
  ])});
  assert.equal(r.ok,false);assert.match(r.issues.join(' '),/total_count changed/);
});
test('rejects a complete scan that underfills published total_count',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([page(1,[item()],false,1272)])});
  assert.equal(r.ok,false);assert.match(r.issues.join(' '),/incomplete catalogue/);
});
test('rejects a page larger than requested per_page',async()=>{
  const rows=Array.from({length:3},(_,i)=>item({product_id:'p'+i}));
  const r=await checkDevelopmentCatalogue({fetchFn:mockFetch([page(1,rows,false,3)]),perPage:2});
  assert.equal(r.ok,false);assert.match(r.issues.join(' '),/more rows than requested/);
});
test('missing total_count and missing has_more_page fail closed',()=>{
  const response=page(1,[item()],false);
  delete response.result.total_count;
  delete response.result.page_context.has_more_page;
  const r=inspectPage(response,1);
  assert.match(r.problems.join(' '),/total_count missing/);
  assert.match(r.problems.join(' '),/has_more_page missing/);
});
test('HTTP 429 throttling must not be misreported as a successful audit',async()=>{
  const r=await checkDevelopmentCatalogue({fetchFn:async()=>({ok:false,status:429})});
  assert.equal(r.ok,false);assert.equal(r.completed,false);
  assert.deepEqual(r.issues,['page 1: HTTP 429']);
});
