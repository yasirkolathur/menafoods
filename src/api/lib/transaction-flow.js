/**
 * MENAFoods single-action transaction policy for existing authenticated Catalyst.
 * Source-only adapter contract. DOES NOT install an endpoint or post directly.
 * Server-side adapters are responsible for scoped Books/Creator reads, roles,
 * complete pagination, durable atomic locking and actual Books write permissions.
 */
export class TransactionException extends Error {
  constructor(code) { super(code); this.name = "TransactionException"; this.code = code; }
}
const fail = code => { throw new TransactionException(code); };
const id = v => String(v ?? "").trim();
export const normalizedName = value => typeof value === "string"
  ? value.normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,"")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ")
  : "";
const digits = value => id(value).replace(/\D/g,"");
const cents = n => {
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100)) ||
      Math.abs(Math.round(n * 100) / 100 - n) > 1e-8) fail("invalid_money");
  return Math.round(n * 100);
};

/** Exact trusted business match. Legal VAT takes precedence over any alias. */
export function matchBusiness({type,input,candidates,complete,trustedAliases={}}) {
  if (!["customer","supplier"].includes(type) || !input || !Array.isArray(candidates))
    fail("invalid_business_lookup");
  if (complete !== true) fail("incomplete_business_lookup");
  const vat = digits(input.vat), phone = digits(input.phone), name = normalizedName(input.name);
  if (!(vat || phone || name)) fail("missing_business_identity");
  const matches = candidates.filter(c => {
    const booksId = id(c.booksId);
    if (!booksId) fail("business_candidate_missing_books_id");
    if (vat) return digits(c.vat) === vat;
    const names = [c.name,...(trustedAliases[booksId] || [])].map(normalizedName);
    return (phone.length >= 9 && digits(c.phone) === phone) ||
      (!!name && names.includes(name));
  });
  const ids = [...new Set(matches.map(c => id(c.booksId)))];
  if (ids.length > 1) fail("ambiguous_business_identity");
  return ids.length ? Object.freeze({status:"matched",booksId:ids[0]})
    : Object.freeze({status:"not_found"});
}

/** Exact SKU/brand/pack match; 100g x40 MUST NOT become 200g x24. */
export function matchProduct({input,candidates,complete}) {
  if (!input || !Array.isArray(candidates)) fail("invalid_product_lookup");
  if (complete !== true) fail("incomplete_product_lookup");
  if (!["brand","unit","packSizeUnit"].every(k => normalizedName(input[k])) ||
      !Number.isFinite(input.packSize) || input.packSize <= 0 ||
      !Number.isSafeInteger(input.packCount) || input.packCount <= 0)
    fail("incomplete_product_package");
  const sku = normalizedName(input.sku), barcode = digits(input.barcode);
  const name = normalizedName(input.productName);
  if (!sku && !barcode && !name) fail("missing_product_name");
  const matches = candidates.filter(c =>
    normalizedName(c.brand) === normalizedName(input.brand) &&
    normalizedName(c.unit) === normalizedName(input.unit) &&
    normalizedName(c.packSizeUnit) === normalizedName(input.packSizeUnit) &&
    Number(c.packSize) === input.packSize &&
    Number(c.packCount) === input.packCount &&
    (sku || barcode ? (!sku || normalizedName(c.sku) === sku) &&
      (!barcode || digits(c.barcode) === barcode) : normalizedName(c.productName) === name)
  );
  const ids = [...new Set(matches.map(c=>id(c.booksItemId)))];
  if (ids.includes("")) fail("product_missing_books_id");
  if (ids.length > 1) fail("ambiguous_product_identity");
  return ids.length ? Object.freeze({status:"matched",booksItemId:ids[0]})
    : Object.freeze({status:"not_found"});
}

/** Cost and margin are SAR per SELECTED selling unit, tax-exclusive. */
export function quoteLine({costSar,marginSar,quantity,unit,purchaseUnit,
  conversionFactor=1,conversionVerified=false,vatRate=0.15,feeSar=0,
  minimumContributionSar=0}) {
  if (!id(unit) || !id(purchaseUnit) || (unit !== purchaseUnit &&
      (conversionVerified !== true || !Number.isFinite(conversionFactor) ||
       conversionFactor <= 0))) fail("unit_conversion_unverified");
  if (!Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isSafeInteger(Math.round(quantity*1000)) ||
      Math.abs(Math.round(quantity*1000)/1000-quantity)>1e-8)
    fail("invalid_quantity");
  if (vatRate !== 0 && vatRate !== 0.15) fail("unsupported_vat_rate");
  const cost = cents(costSar), margin = cents(marginSar);
  const unitPriceHalalas = cost+margin;
  const subtotalHalalas = Math.round(unitPriceHalalas*quantity);
  const vatHalalas = Math.round(subtotalHalalas*vatRate);
  const grossProfitHalalas = Math.round(margin*quantity);
  const contributionHalalas = grossProfitHalalas-cents(feeSar);
  const totalHalalas = subtotalHalalas+vatHalalas;
  // Halala arithmetic must remain exact at every stage. JavaScript doubles
  // cannot safely represent larger totals even when individual prices are valid.
  if (![unitPriceHalalas,subtotalHalalas,vatHalalas,grossProfitHalalas,
    contributionHalalas,totalHalalas].every(Number.isSafeInteger))
    fail("invalid_money");
  if (contributionHalalas<cents(minimumContributionSar)) fail("contribution_below_floor");
  return Object.freeze({unit,quantity,unitPriceHalalas,subtotalHalalas,
    vatHalalas,totalHalalas,grossProfitHalalas,contributionHalalas});
}
const canonicalLines = rows => rows.map(r=>[
  id(r.itemId),String(r.quantity),normalizedName(r.unit),
  String(r.unitPriceHalalas),String(r.vatHalalas)
]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
function matched(expected,actual) {
  if (!actual || !id(actual.booksId) || id(actual.partyId)!==id(expected.partyId) ||
      id(actual.reference)!==id(expected.reference) ||
      expected.totalHalalas!==actual.totalHalalas ||
      !Array.isArray(actual.lines) || actual.lines.length!==expected.lines.length) return false;
  return JSON.stringify(canonicalLines(expected.lines))===JSON.stringify(canonicalLines(actual.lines));
}
/**
 * Exactly-once writer seam. Server constructs expected after auth + trusted
 * preflight; NOT from raw browser inputs. The atomic claim MUST be durable.
 * A timeout after POST remains NEEDS_REVIEW: never blindly release/re-POST.
 */
export async function commitVerifiedTransaction({expected,deps}) {
  if (!expected || !["purchase_bill","sales_order"].includes(expected.type) ||
      !id(expected.organizationId) || !id(expected.partyId) || !id(expected.reference) ||
      !Number.isSafeInteger(expected.totalHalalas) || expected.totalHalalas<1 ||
      !Array.isArray(expected.lines) || !expected.lines.length ||
      !deps || ["authorize","claim","findExisting","create","readBack","complete","needsReview"]
        .some(k=>typeof deps[k]!=="function")) fail("transaction_not_ready");
  if (await deps.authorize(expected)!==true) fail("unauthorized_transaction");
  if (expected.authoritativePreflight!==true || !expected.lines.every(row=>
      id(row.itemId) && Number.isFinite(row.quantity) && row.quantity>0 &&
      id(row.unit) && Number.isSafeInteger(row.unitPriceHalalas) &&
      row.unitPriceHalalas>=0 && Number.isSafeInteger(row.vatHalalas) &&
      row.vatHalalas>=0)) fail("authoritative_preflight_required");
  const key = [expected.type,id(expected.organizationId),id(expected.partyId),id(expected.reference)].join(":");
  const claim = await deps.claim(key);
  if (claim!=="acquired") return Object.freeze({status:"IN_PROGRESS_OR_ALREADY_CLAIMED"});
  let wasExisting = false;
  try {
    let existing = await deps.findExisting(expected);
    if (existing) wasExisting = true;
    else existing = await deps.create(expected); // never POST a duplicate
    if (!id(existing?.booksId)) fail("books_write_unconfirmed");
    let verified = await deps.readBack({type:expected.type,booksId:existing.booksId});
    if (wasExisting && (!matched(expected,verified) ||
        id(verified?.booksId)!==id(existing.booksId))) {
      // Existing bills must NEVER be overwritten by this workflow.
      // An existing sales order update needs its known canonical Books ID and
      // explicit server-side authorization, then a fresh authoritative GET.
      if (expected.type!=="sales_order" || expected.updateExisting!==true ||
          id(expected.existingBooksId)!==id(existing.booksId) ||
          typeof deps.update!=="function") fail("books_existing_conflict");
      await deps.update({booksId:id(existing.booksId),expected});
      verified = await deps.readBack({type:expected.type,booksId:existing.booksId});
    }
    if (id(verified?.booksId)!==id(existing.booksId) || !matched(expected,verified))
      fail("books_reconciliation_mismatch");
    await deps.complete(key,{status:"BOOKS_VERIFIED",booksId:id(existing.booksId)});
    return Object.freeze({status:"BOOKS_VERIFIED",booksId:id(existing.booksId),wasExisting});
  } catch(error) {
    await deps.needsReview(key,{reason:error instanceof TransactionException ?
      error.code:"books_outcome_uncertain"});
    throw error;
  }
}
