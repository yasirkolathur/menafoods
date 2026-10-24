import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCashPilotPreflight} from '../src/api/lib/cash-pilot-preflight.js';

const NOW=1800000000000;
function fixture(){
  return {
    nowMs:NOW,
    principal:{serverVerified:true,confirmed:true,userId:'user-a',role:'OWNER',businessId:'business-a'},
    business:{id:'business-a',active:true,booksCustomerId:'customer-a',priceListId:'plist-a'},
    creatorCustomer:{serverVerified:true,businessId:'business-a',booksCustomerId:'customer-a',priceListId:'plist-a'},
    booksCustomer:{serverVerified:true,id:'customer-a'},
    booksPrice:{serverVerified:true,source:'ZOHO_BOOKS',booksCustomerId:'customer-a',
      itemId:'item-a',priceListId:'plist-a',currency:'SAR',unit:'box',
      taxInclusive:false,unitPriceHalalas:6200,vatRate:0.15,vatVerified:true},
    product:{booksItemId:'item-a',primaryUnit:'box',active:true,showInStorefront:true},
    inventory:{serverVerified:true,source:'ZOHO_INVENTORY',itemId:'item-a',
      warehouseId:'wh-a',stockUnit:'box',availableQuantity:17,checkedAtMs:NOW-60000},
    order:{itemId:'item-a',unit:'box',quantity:1,paymentMethod:'CASH'},
    policy:{warehouseId:'wh-a',checkoutMode:'ENFORCE',creditMode:'OBSERVE'}
  };
}
function check(mutator){
  const x=fixture();mutator(x);return assessCashPilotPreflight(x);
}
const fail=(result,code)=>{
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.failures.includes(code),`missing failure ${code}: ${result.failures.join(',')}`);
  assert.equal(result.quote,null);
  assert.equal(result.postAllowed,false);
};
test('trusted one-box CASH preview calculates SAR 62 + 15% VAT but never permits POST',()=>{
  const r=assessCashPilotPreflight(fixture());
  assert.deepEqual(r,{status:'PREVIEW_VERIFIED',failures:[],
    quote:{unit:'box',quantity:1,unitPriceHalalas:6200,subtotalHalalas:6200,
      vatHalalas:930,totalHalalas:7130},postAllowed:false});
  assert.equal(Object.isFrozen(r),true);
});
test('business vs Creator price list mismatch blocks rather than overwriting',()=>{
  fail(check(x=>{x.creatorCustomer.priceListId='plist-old';}),'CUSTOMER_PRICE_LIST_MISMATCH');
});
test('Books effective price list differs even when Creator/account match',()=>{
  fail(check(x=>{x.booksPrice.priceListId='plist-other';}),'CUSTOMER_PRICE_LIST_MISMATCH');
});
test('missing Books effective-price proof blocks Commerce price fallback',()=>{
  fail(check(x=>{x.booksPrice.serverVerified=false;}),'EFFECTIVE_BOOKS_PRICE_UNVERIFIED');
});
test('unconfirmed session or browser-supplied role is rejected',()=>{
  fail(check(x=>{x.principal.confirmed=false;}),'CONFIRMED_SESSION_REQUIRED');
  fail(check(x=>{x.principal.role='SELLER';}),'CONFIRMED_SESSION_REQUIRED');
});
test('a different business account cannot reuse test-company customer mapping',()=>{
  fail(check(x=>{x.principal.businessId='business-b';}),'BUSINESS_SCOPE_UNVERIFIED');
  fail(check(x=>{x.creatorCustomer.booksCustomerId='customer-b';}),'BOOKS_CUSTOMER_MAPPING_UNVERIFIED');
});
test('wrong item ID is rejected before quote or any write',()=>{
  fail(check(x=>{x.inventory.itemId='another-item';}),'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
  fail(check(x=>{x.booksPrice.itemId='another-item';}),'EFFECTIVE_BOOKS_PRICE_UNVERIFIED');
});
test('rejects stock from a different warehouse',()=>{
  fail(check(x=>{x.inventory.warehouseId='other-warehouse';}),'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
});
test('rejects stock shortage and absence of fresh Inventory verification',()=>{
  fail(check(x=>{x.order.quantity=18;}),'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
  fail(check(x=>{x.inventory.availableQuantity=0;}),'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
  fail(check(x=>{x.inventory.serverVerified=false;}),'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
});
test('rejects old or future Inventory timestamps',()=>{
  fail(check(x=>{x.inventory.checkedAtMs=NOW-300001;}),'INVENTORY_READ_STALE');
  fail(check(x=>{x.inventory.checkedAtMs=NOW+1;}),'INVENTORY_READ_STALE');
});
test('primary-only pilot never assumes carton-to-kg conversion',()=>{
  fail(check(x=>{x.order.unit='kg';}),'PRIMARY_UNIT_OR_PRODUCT_UNVERIFIED');
  fail(check(x=>{x.order.quantity=1.25;}),'PRIMARY_UNIT_OR_PRODUCT_UNVERIFIED');
});
test('inactive or hidden item fails despite positive warehouse stock',()=>{
  fail(check(x=>{x.product.showInStorefront=false;}),'PRIMARY_UNIT_OR_PRODUCT_UNVERIFIED');
  fail(check(x=>{x.product.active=false;}),'PRIMARY_UNIT_OR_PRODUCT_UNVERIFIED');
});
test('tax must be explicitly verified as exclusive 15 percent VAT',()=>{
  fail(check(x=>{x.booksPrice.vatVerified=false;}),'VAT_15_PERCENT_NOT_VERIFIED');
  fail(check(x=>{x.booksPrice.vatRate=0;}),'VAT_15_PERCENT_NOT_VERIFIED');
  fail(check(x=>{x.booksPrice.taxInclusive=true;}),'EFFECTIVE_BOOKS_PRICE_UNVERIFIED');
});
test('credit and unverified prepaid are not valid CASH pilot paths',()=>{
  fail(check(x=>{x.order.paymentMethod='CREDIT';}),'PILOT_PAYMENT_POLICY_UNVERIFIED');
  fail(check(x=>{x.order.paymentMethod='PREPAID';}),'PILOT_PAYMENT_POLICY_UNVERIFIED');
});
test('checkout enforcement mode and credit observe mode are mandatory',()=>{
  fail(check(x=>{x.policy.checkoutMode='OFF';}),'PILOT_PAYMENT_POLICY_UNVERIFIED');
  fail(check(x=>{x.policy.creditMode='ENFORCE';}),'PILOT_PAYMENT_POLICY_UNVERIFIED');
});
test('multiple blocks produce only safe fixed labels with no IDs or tokens',()=>{
  const r=check(x=>{x.principal.confirmed=false;x.business.priceListId='wrong';x.inventory.warehouseId='wrong';});
  assert.equal(r.status,'BLOCKED');assert.equal(r.failures.length,3);
  assert.ok(!JSON.stringify(r).includes('customer-a'));
  assert.ok(!JSON.stringify(r).includes('business-a'));
});
test('missing all evidence objects returns BLOCKED without crashing',()=>{
  const r=assessCashPilotPreflight();
  assert.equal(r.status,'BLOCKED');assert.equal(r.postAllowed,false);
  assert.ok(r.failures.length>=5);
});
