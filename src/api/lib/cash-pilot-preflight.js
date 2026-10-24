/**
 * MENAFoods Development CASH pilot — server-side evidence gate (READ-ONLY).
 *
 * This helper never invokes Zoho, creates orders, authorizes payment or changes
 * the checkout allowlist. All objects MUST come from authenticated, scoped,
 * trusted server-side adapters; do not use values asserted by a browser.
 *
 * A PREVIEW_VERIFIED result is NOT approval to POST a Sales Order. A separate
 * server-side release policy, owner authorization, durable idempotency claim,
 * and canonical Books + Creator reconciliation remain mandatory.
 */
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
const same=(...values)=>values.every(nonEmpty)&&values.every(v=>v===values[0]);
const money=v=>Number.isSafeInteger(v)&&v>0;
const qty=v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&
  Math.abs(Math.round(v*1000)/1000-v)<1e-8;
const frozen=values=>Object.freeze(values);

export function assessCashPilotPreflight({
  principal, business, creatorCustomer, booksCustomer, booksPrice,
  product, inventory, order, policy, nowMs
}={}) {
  const failures=[];
  const block=(when,code)=>{if(when)failures.push(code);};

  // Verified identity and ownership, never supplied by frontend role flags.
  block(principal?.serverVerified!==true||principal?.confirmed!==true||
    !nonEmpty(principal?.userId)||!['OWNER','ADMIN','BUYER'].includes(principal?.role),
    'CONFIRMED_SESSION_REQUIRED');
  block(business?.active!==true||!same(principal?.businessId,business?.id)||
    !nonEmpty(business?.id),'BUSINESS_SCOPE_UNVERIFIED');
  block(creatorCustomer?.serverVerified!==true||booksCustomer?.serverVerified!==true||
    !same(business?.id,creatorCustomer?.businessId)||
    !same(business?.booksCustomerId,creatorCustomer?.booksCustomerId,booksCustomer?.id),
    'BOOKS_CUSTOMER_MAPPING_UNVERIFIED');

  // A mismatch is blocking evidence, NOT a reason to overwrite Zoho records.
  block(!same(business?.priceListId,creatorCustomer?.priceListId,booksPrice?.priceListId),
    'CUSTOMER_PRICE_LIST_MISMATCH');
  block(booksPrice?.serverVerified!==true||booksPrice?.source!=='ZOHO_BOOKS'||
    !same(booksPrice?.booksCustomerId,booksCustomer?.id)||
    !same(booksPrice?.itemId,product?.booksItemId,order?.itemId)||
    booksPrice?.currency!=='SAR'||booksPrice?.taxInclusive!==false||
    !money(booksPrice?.unitPriceHalalas),
    'EFFECTIVE_BOOKS_PRICE_UNVERIFIED');

  // Pilot is primary-unit only until exact native secondary UOM proof.
  block(!nonEmpty(order?.itemId)||!nonEmpty(order?.unit)||
    !same(order?.unit,product?.primaryUnit,inventory?.stockUnit,booksPrice?.unit)||
    !qty(order?.quantity)||!Number.isInteger(order?.quantity)||
    product?.active!==true||product?.showInStorefront!==true,
    'PRIMARY_UNIT_OR_PRODUCT_UNVERIFIED');
  block(inventory?.serverVerified!==true||inventory?.source!=='ZOHO_INVENTORY'||
    !same(inventory?.itemId,product?.booksItemId)||
    !same(inventory?.warehouseId,policy?.warehouseId)||
    !Number.isSafeInteger(inventory?.availableQuantity)||
    inventory.availableQuantity<order?.quantity,
    'INVENTORY_WAREHOUSE_STOCK_UNVERIFIED');
  block(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(inventory?.checkedAtMs)||
    inventory.checkedAtMs>nowMs||
    nowMs-inventory.checkedAtMs>300000,
    'INVENTORY_READ_STALE');
  block(booksPrice?.vatRate!==0.15||booksPrice?.vatVerified!==true,
    'VAT_15_PERCENT_NOT_VERIFIED');

  // CASH preview, explicitly disallow credit, unverified prepaid, and posting.
  block(order?.paymentMethod!=='CASH'||policy?.checkoutMode!=='ENFORCE'||
    policy?.creditMode!=='OBSERVE',
    'PILOT_PAYMENT_POLICY_UNVERIFIED');

  const subtotal=booksPrice?.unitPriceHalalas*order?.quantity;
  const vat=Number.isSafeInteger(subtotal)?Math.round(subtotal*0.15):NaN;
  block(!Number.isSafeInteger(subtotal)||subtotal<=0||
    !Number.isSafeInteger(vat)||!Number.isSafeInteger(subtotal+vat),
    'QUOTE_AMOUNT_UNSAFE');
  const unique=frozen([...new Set(failures)]);
  const quote=unique.length===0?frozen({
    unit:order.unit,
    quantity:order.quantity,
    unitPriceHalalas:booksPrice.unitPriceHalalas,
    subtotalHalalas:subtotal,
    vatHalalas:vat,
    totalHalalas:subtotal+vat
  }):null;
  return frozen({
    status:unique.length?'BLOCKED':'PREVIEW_VERIFIED',
    failures:unique,
    quote,
    // Intentional: cannot approve or POST a financial transaction in this helper.
    postAllowed:false
  });
}
