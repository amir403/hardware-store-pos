import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, readImportFile } from "./product-import";

test("import: csv handles quotes, commas, BOM, CRLF and semicolons", () => {
  assert.deepEqual(parseCsv('﻿Name,Price\r\n"Pipe 1"", PVC",250\r\n\r\n,\r\n'), [
    ["Name", "Price"],
    ['Pipe 1", PVC', "250"],
  ]);
  assert.deepEqual(parseCsv("Name;Price\nTap;1.250,5"), [
    ["Name", "Price"],
    ["Tap", "1.250,5"],
  ]);
});

test("import: headers are matched by common names and rows are checked", () => {
  const csv = [
    "Item Name,Code,Sale Price,Cost,Qty,UOM,GST",
    "Hammer,H-1,\"Rs 1,250\",900,10,,0",
    "Nails 2in,N-2,15,10,2.5,kg,",
    ",X-1,10,,,,",
    "Saw,H-1,abc,,,,",
    "Glue,G-1,100,,,litre,",
  ].join("\n");
  const { rows, error } = readImportFile(csv);
  assert.equal(error, undefined);
  assert.deepEqual(rows[0].row, {
    name: "Hammer", sku: "H-1", barcode: null, category: null, unit: null,
    costPrice: 900, price: 1250, wholesalePrice: null, taxRate: 0, stockQty: 10, reorderLevel: null,
  });
  assert.equal(rows[2].name, "");
  assert.equal(rows[3].name, "Saw");
  assert.equal(rows[1].row?.stockQty, 2.5);
  assert.equal(rows[1].row?.unit, "kg");
  assert.deepEqual(rows[2].errors, ["Name is missing"]);
  assert.ok(rows[3].errors.some((e) => e.includes("also on line 2")));
  assert.ok(rows[3].errors.some((e) => e.includes("not a number")));
  assert.ok(rows[4].errors[0].startsWith('Unit "litre"'));
  assert.equal(rows[4].line, 6);
});

test("import: thousands commas and comma decimals both read right", () => {
  const { rows } = readImportFile('Name;Price;Cost\nA;1.250,50;12,5\nB;"1,250";1250');
  assert.equal(rows[0].row?.price, 1250.5);
  assert.equal(rows[0].row?.costPrice, 12.5);
  assert.equal(rows[1].row?.price, 1250);
});

test("import: a file without name and price columns is refused", () => {
  assert.match(readImportFile("Code,Qty\nA,1").error ?? "", /Name/);
  assert.match(readImportFile("Name,Price").error ?? "", /no product lines/);
});
