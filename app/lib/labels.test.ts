import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLabelCount, encodeLabelItem, parseLabelItems } from "./labels";

test("label count: one per piece for counted units, one for measured ones", () => {
  assert.equal(defaultLabelCount("pcs", 8), 8);
  assert.equal(defaultLabelCount("box", 2.5), 2);
  assert.equal(defaultLabelCount("pcs", 0), 1);
  assert.equal(defaultLabelCount("pcs", 5000), 100);
  assert.equal(defaultLabelCount("yard", 500), 1);
  assert.equal(defaultLabelCount("kg", 40), 1);
});

test("label items round-trip and bad input is dropped or clamped", () => {
  assert.deepEqual(parseLabelItems([encodeLabelItem("abc", 3), "def:1"]), [
    { id: "abc", count: 3 },
    { id: "def", count: 1 },
  ]);
  assert.deepEqual(parseLabelItems("abc:999"), [{ id: "abc", count: 100 }]);
  assert.deepEqual(parseLabelItems(["abc:0", "abc:5", "x y:2", "def", "ghi:-1"]), [{ id: "abc", count: 1 }]);
  assert.deepEqual(parseLabelItems(undefined), []);
});
