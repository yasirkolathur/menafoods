import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOneCreatorBooksMapping, summarizeCreatorBooksCollisions
} from "../src/api/lib/creator-so-integrity.js";

const row = (overrides = {}) => ({
  ID: "creator-1", SO_ZBooks_ID: "books-so-1",
  Customer_Form: "creator-customer-1",
  Customer_ZBooks_ID: "books-customer-1",
  ...overrides
});
const ctx = (overrides = {}) => ({
  booksSalesOrderId: "books-so-1", booksCustomerId: "books-customer-1",
  creatorCustomerId: "creator-customer-1", searchComplete: true,
  ...overrides
});

test("canonical Creator proof matches exactly one Books SO and both customer mappings", () => {
  const proof = assertOneCreatorBooksMapping([row()], ctx());
  assert.equal(proof.creatorRecordId, "creator-1");
  assert.equal(proof.booksSalesOrderId, "books-so-1");
  assert.equal(proof.formLinkName, "Sales_Order_ZBooks");
  assert.equal(proof.mappingCount, 1);
});

test("allow Creator lookup value as an ID object, never a display name", () => {
  assert.equal(assertOneCreatorBooksMapping([row({
    Customer_Form: { ID: "creator-customer-1", zc_display_value: "Example" }
  })], ctx()).creatorRecordId, "creator-1");
  assert.throws(() => assertOneCreatorBooksMapping([row({
    Customer_Form: { zc_display_value: "Example" }
  })], ctx()), /canonical_creator_customer_mismatch/);
});

test("missing, duplicate and incomplete result sets block canonical mapping", () => {
  assert.throws(() => assertOneCreatorBooksMapping([], ctx()),
    /canonical_creator_mapping_missing_or_duplicate/);
  assert.throws(() => assertOneCreatorBooksMapping([row(), row({ ID: "creator-2" })], ctx()),
    /canonical_creator_mapping_missing_or_duplicate/);
  assert.throws(() => assertOneCreatorBooksMapping([row()], ctx({ searchComplete: false })),
    /creator_mapping_lookup_incomplete/);
  assert.throws(() => assertOneCreatorBooksMapping([row({ SO_ZBooks_ID: "other" })], ctx()),
    /canonical_creator_mapping_missing_or_duplicate/);
});

test("one Creator row linked to wrong Books customer is rejected", () => {
  assert.throws(() => assertOneCreatorBooksMapping([row({
    Customer_ZBooks_ID: "different"
  })], ctx()), /canonical_creator_customer_mismatch/);
  assert.throws(() => assertOneCreatorBooksMapping([row({
    Customer_Form: "someone-else"
  })], ctx()), /canonical_creator_customer_mismatch/);
});

test("aggregate audit counts duplicate mappings without emitting IDs or customer data", () => {
  const rows = [row(), row({ ID: "creator-2" }),
    row({ ID: "creator-3", Customer_ZBooks_ID: "other" }),
    row({ ID: "creator-4", SO_ZBooks_ID: "books-so-2" }),
    row({ ID: "creator-5", SO_ZBooks_ID: "" })];
  const result = summarizeCreatorBooksCollisions(rows);
  assert.deepEqual(result, {
    scannedRecords: 5, isComplete: false, missingBooksId: 1,
    booksIdsWithMultipleCreatorRows: 1, excessCreatorMappings: 2,
    crossBooksCustomerMappingGroups: 1
  });
  assert.equal(JSON.stringify(result).includes("books-so-1"), false);
  assert.equal(summarizeCreatorBooksCollisions(rows, { searchComplete: true }).isComplete, true);
});
