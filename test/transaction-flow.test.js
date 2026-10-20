import test from "node:test";
import assert from "node:assert/strict";
import {normalizedName,matchBusiness,matchProduct,quoteLine,commitVerifiedTransaction} from "../src/api/lib/transaction-flow.js";
const p=(n=200,k=24)=>({productName:"Almarai Butter",brand:"Almarai",unit:"ctn",packSize:n,packSizeUnit:"g",packCount:k,booksItemId:"item-1"});
test("normalized names stay distinct",()=> {
  assert.equal(normalizedName(" مقهى غَيْثه  "),"مقهى غيثه");
  assert.notEqual(normalizedName("Ghartiyas"),normalizedName("Ghaitha"));
});
test("VAT match and no fuzzy alias substitution",()=> {
  const c=[{booksId:"cust1",name:"Ghaitha Café",vat:"123456789012345"}];
  assert.deepEqual(matchBusiness({type:"customer",input:{name:"Ghartiyas"},candidates:c,complete:true}),{status:"not_found"});
  assert.deepEqual(matchBusiness({type:"customer",input:{vat:"123456789012345"},candidates:c,complete:true}),{status:"matched",booksId:"cust1"});
});
test("conflicting VAT blocks name-only match",()=> {
  const c=[{booksId:"1",name:"Supplier A",vat:"111111111111111"}];
  assert.deepEqual(matchBusiness({type:"supplier",input:{name:"Supplier A",vat:"222222222222222"},candidates:c,complete:true}),{status:"not_found"});
});
test("only server registry can map Arabic alias",()=> {
  const c=[{booksId:"1",name:"Hilal Al Aroos"}];
  assert.deepEqual(matchBusiness({type:"supplier",input:{name:"هلال العروس"},candidates:c,complete:true,trustedAliases:{"1":["هلال العروس"]}}),{status:"matched",booksId:"1"});
});
test("ambiguous business or incomplete lookup fails closed",()=> {
  const c=[{booksId:"1",name:"AB"},{booksId:"2",name:"AB"}];
  assert.throws(()=>matchBusiness({type:"supplier",input:{name:"AB"},candidates:c,complete:true}),/ambiguous_business_identity/);
  assert.throws(()=>matchBusiness({type:"supplier",input:{name:"AB"},candidates:c,complete:false}),/incomplete_business_lookup/);
});
test("pack size mismatch cannot substitute 100g x40 for 200g x24",()=> {
  const input=p(); const candidates=[p(100,40)];
  assert.deepEqual(matchProduct({input,candidates,complete:true}),{status:"not_found"});
  assert.deepEqual(matchProduct({input,candidates:[...candidates,p()],complete:true}),{status:"matched",booksItemId:"item-1"});
});
test("matching SKU with conflicting barcode is not matched",()=> {
  const input={...p(),sku:"a1",barcode:"987654"};
  const candidates=[{...p(),sku:"a1",barcode:"123456"}];
  assert.deepEqual(matchProduct({input,candidates,complete:true}),{status:"not_found"});
});
test("product ID collisions require review",()=> {
  assert.throws(()=>matchProduct({input:p(),candidates:[p(),{...p(),booksItemId:"item2"}],complete:true}),/ambiguous_product_identity/);
});
test("SAR 46 plus 20 with 15% VAT is SAR 75.90",()=> {
  const q=quoteLine({costSar:46,marginSar:20,quantity:1,unit:"pcs",purchaseUnit:"pcs"});
  assert.equal(q.unitPriceHalalas,6600);
  assert.equal(q.totalHalalas,7590);
  assert.equal(q.contributionHalalas,2000);
});
test("butter carton price yields SAR 604.90 and SAR 40 gross profit",()=> {
  const q=quoteLine({costSar:243,marginSar:20,quantity:2,unit:"ctn",purchaseUnit:"ctn"});
  assert.equal(q.totalHalalas,60490);assert.equal(q.grossProfitHalalas,4000);
});
test("margin contribution floor and unverified unit conversion reject",()=> {
  assert.throws(()=>quoteLine({costSar:46,marginSar:20,quantity:1,feeSar:16,minimumContributionSar:5,unit:"pcs",purchaseUnit:"pcs"}),/contribution_below_floor/);
  assert.throws(()=>quoteLine({costSar:3,marginSar:2,quantity:1,unit:"pcs",purchaseUnit:"ctn",conversionFactor:24}),/unit_conversion_unverified/);
});
test("up to three decimals supported for weight quantities",()=> {
  const q=quoteLine({costSar:10,marginSar:5,quantity:1.125,unit:"kg",purchaseUnit:"kg"});
  assert.equal(q.subtotalHalalas,1688);
  assert.throws(()=>quoteLine({costSar:10,marginSar:5,quantity:1.0001,unit:"kg",purchaseUnit:"kg"}),/invalid_quantity/);
});
const expected={type:"purchase_bill",organizationId:"org1",partyId:"vendor1",reference:"37254",authoritativePreflight:true,totalHalalas:5290,
  lines:[{itemId:"item1",quantity:1,unit:"pcs",unitPriceHalalas:4600,vatHalalas:690}]};
const receipt={booksId:"bill1",partyId:"vendor1",reference:"37254",totalHalalas:5290,lines:expected.lines};
function deps(overrides={}) {
 const calls=[];const base={
  authorize:async()=>{calls.push("auth");return true;},
  claim:async()=>{calls.push("claim");return "acquired";},
  findExisting:async()=>{calls.push("lookup");return null;},
  create:async()=>{calls.push("write");return {booksId:"bill1"};},
  readBack:async()=>{calls.push("read");return receipt;},
  complete:async()=>{calls.push("complete");},
  needsReview:async()=>{calls.push("review");}
 };
 return {calls,...base,...overrides};
}
test("single verified write uses one lookup/write/readback",async()=> {
 const d=deps();const result=await commitVerifiedTransaction({expected,deps:d});
 assert.deepEqual(result,{status:"BOOKS_VERIFIED",booksId:"bill1",wasExisting:false});
 assert.deepEqual(d.calls,["auth","claim","lookup","write","read","complete"]);
});
test("exact existing Books bill prevents duplicate post",async()=> {
 const d=deps();d.findExisting=async()=>{d.calls.push("lookup");return {booksId:"bill1"};};
 const result=await commitVerifiedTransaction({expected,deps:d});
 assert.equal(result.wasExisting,true);assert.ok(!d.calls.includes("write"));
});
test("atomic duplicate claim prevents second Books write",async()=> {
 const d=deps();d.claim=async()=>{d.calls.push("claim");return "already_claimed";};
 const result=await commitVerifiedTransaction({expected,deps:d});
 assert.equal(result.status,"IN_PROGRESS_OR_ALREADY_CLAIMED");
 assert.deepEqual(d.calls,["auth","claim"]);
});
test("Books total mismatch never claims success",async()=> {
 const d=deps();d.readBack=async()=>{d.calls.push("read");return {...receipt,totalHalalas:9999};};
 await assert.rejects(commitVerifiedTransaction({expected,deps:d}),/books_reconciliation_mismatch/);
 assert.ok(d.calls.includes("review"));assert.ok(!d.calls.includes("complete"));
});
test("POST timeout retained for reconciliation not auto retry",async()=> {
 const d=deps();d.create=async()=>{d.calls.push("write");throw new Error("timeout");};
 await assert.rejects(commitVerifiedTransaction({expected,deps:d}),/timeout/);
 assert.ok(d.calls.includes("review"));assert.ok(!d.calls.includes("complete"));
});
test("unauthorized request fails before claim",async()=> {
 const d=deps();d.authorize=async()=>{d.calls.push("auth");return false;};
 await assert.rejects(commitVerifiedTransaction({expected,deps:d}),/unauthorized_transaction/);
 assert.deepEqual(d.calls,["auth"]);
});
