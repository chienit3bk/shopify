import assert from "node:assert/strict";
import { test } from "node:test";
import { chunk, discountedPrice, validateRule } from "./pricing.ts";

const rule = {
  name: "Gold",
  companyLocationId: "gid://shopify/CompanyLocation/1",
  percentOff: 20,
  collectionId: null,
  collectionPercentOff: null,
};

test("discountedPrice rounds to cents", () => {
  assert.equal(discountedPrice("48.00", 30), "33.60");
  assert.equal(discountedPrice("19.99", 15), "16.99");
  assert.equal(discountedPrice("0.10", 33), "0.07");
});

test("chunk respects the 250-price API limit", () => {
  const sizes = chunk(Array.from({ length: 501 }), 250).map((c) => c.length);
  assert.deepEqual(sizes, [250, 250, 1]);
});

test("validateRule rejects bad input", () => {
  assert.equal(validateRule(rule), null);
  assert.match(validateRule({ ...rule, name: "" }) ?? "", /name/);
  assert.match(validateRule({ ...rule, percentOff: 100 }) ?? "", /Catalog/);
  assert.match(validateRule({ ...rule, percentOff: NaN }) ?? "", /Catalog/);
  assert.match(
    validateRule({ ...rule, collectionId: "gid://shopify/Collection/1" }) ?? "",
    /Collection/,
  );
});
