/**
 * Canonical Creator Sales_Order_ZBooks mapping verifier.
 * Run ONLY after a complete, authenticated and paginated Creator lookup scoped
 * to the Books salesorder_id. Never query or mutate legacy Sales_Order here.
 * Existing historical duplicates are left untouched and block pilot checkout.
 */
function id(value) {
  if (value && typeof value === "object") return id(value.ID ?? value.id);
  return value == null ? "" : String(value).trim();
}

export function assertOneCreatorBooksMapping(records, {
  booksSalesOrderId, booksCustomerId, creatorCustomerId, searchComplete
}) {
  if (searchComplete !== true || !Array.isArray(records) ||
      !id(booksSalesOrderId) || !id(booksCustomerId) || !id(creatorCustomerId)) {
    throw new Error("creator_mapping_lookup_incomplete");
  }
  const matching = records.filter(row => id(row?.SO_ZBooks_ID) === id(booksSalesOrderId));
  if (matching.length !== 1) {
    throw new Error("canonical_creator_mapping_missing_or_duplicate");
  }
  const row = matching[0];
  if (!id(row.ID) || id(row.Customer_ZBooks_ID) !== id(booksCustomerId) ||
      id(row.Customer_Form) !== id(creatorCustomerId)) {
    throw new Error("canonical_creator_customer_mismatch");
  }
  return Object.freeze({
    formLinkName: "Sales_Order_ZBooks",
    creatorRecordId: id(row.ID),
    booksSalesOrderId: id(booksSalesOrderId),
    booksCustomerId: id(booksCustomerId),
    creatorCustomerId: id(creatorCustomerId),
    mappingCount: 1,
    searchComplete: true
  });
}

/**
 * Aggregate-only inspection. No customer details or raw IDs are returned.
 * A partial cursor batch must always be reported as a sample.
 */
export function summarizeCreatorBooksCollisions(records, { searchComplete = false } = {}) {
  if (!Array.isArray(records)) throw new Error("creator_records_invalid");
  const groups = new Map();
  let unlinked = 0;
  for (const row of records) {
    const bid = id(row?.SO_ZBooks_ID);
    if (!bid) { unlinked++; continue; }
    if (!groups.has(bid)) groups.set(bid, []);
    groups.get(bid).push(row);
  }
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  return Object.freeze({
    scannedRecords: records.length,
    isComplete: searchComplete === true,
    missingBooksId: unlinked,
    booksIdsWithMultipleCreatorRows: duplicates.length,
    excessCreatorMappings: duplicates.reduce((n, group) => n + group.length - 1, 0),
    crossBooksCustomerMappingGroups: duplicates.filter(group =>
      new Set(group.map(row => id(row.Customer_ZBooks_ID))).size > 1).length
  });
}
