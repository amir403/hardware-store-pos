import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceSettlement } from "./ledger";
import { purchaseSettlement } from "./payables";
import { cashierPricingProblem, nextDailyNumber, returnCredit } from "./sale-pricing";
import { whatsappLink } from "./whatsapp";

const sale = (o: Partial<Parameters<typeof invoiceSettlement>[0]> = {}) => ({
  total: 2000,
  paidAmount: 1000,
  payments: [],
  returns: [],
  ...o,
});

test("invoice: part paid credit sale owes the rest", () => {
  assert.deepEqual(invoiceSettlement(sale()), {
    netTotal: 2000,
    settled: 1000,
    due: 1000,
    returned: 0,
    refunded: 0,
  });
});

test("invoice: later payments and returns come off what is owed", () => {
  const s = invoiceSettlement(
    sale({
      payments: [{ amount: 300 }],
      returns: [{ amount: 531.4, refundAmount: 0 }],
    })
  );
  assert.equal(s.netTotal, 1468.6);
  assert.equal(s.due, 168.6);
});

test("invoice: cash paid back on a return is no longer collected", () => {
  const s = invoiceSettlement(
    sale({
      returns: [
        { amount: 531.4, refundAmount: 0 },
        { amount: 1062.8, refundAmount: 594.2 },
      ],
    })
  );
  assert.equal(s.netTotal, 405.8);
  assert.equal(s.settled, 405.8);
  assert.equal(s.due, 0);
});

test("purchase: returns to supplier reduce what we owe", () => {
  const p = purchaseSettlement({
    total: 4500,
    paidAmount: 1500,
    payments: [{ amount: 1000 }],
    returns: [{ amount: 900 }],
  });
  assert.deepEqual(p, { paid: 2500, returned: 900, netTotal: 3600, due: 1100 });
});

test("purchase: returning goods already paid for leaves an advance", () => {
  const p = purchaseSettlement({ total: 1000, paidAmount: 1000, payments: [], returns: [{ amount: 400 }] });
  assert.equal(p.due, -400);
});

test("return credit: pro rata, and the last units take what is left", () => {
  const line = { lineValue: 1594.2, soldQty: 3 };
  const first = returnCredit({ ...line, creditedSoFar: 0, quantity: 1, remaining: 3 });
  assert.equal(first, 531.4);
  const rest = returnCredit({ ...line, creditedSoFar: first, quantity: 2, remaining: 2 });
  assert.equal(rest, 1062.8);
  assert.equal(Math.round((first + rest) * 100) / 100, line.lineValue);
});

test("return credit: never more than the value left on the line", () => {
  assert.equal(
    returnCredit({ lineValue: 100, soldQty: 3, creditedSoFar: 99.99, quantity: 1, remaining: 2 }),
    0.01
  );
});

const line = (o: Partial<Parameters<typeof cashierPricingProblem>[0][number]> = {}) => ({
  productName: "Ball Valve",
  quantity: 2,
  unitPrice: 550,
  discount: 0,
  listPrice: 550,
  wholesalePrice: 500,
  ...o,
});

test("cashier: list price and a small discount are fine", () => {
  assert.equal(
    cashierPricingProblem([line({ discount: 50 })], 50, { wholesale: false, maxDiscountPct: 10 }),
    null
  );
});

test("cashier: cannot sell below the list price", () => {
  assert.match(
    cashierPricingProblem([line({ unitPrice: 500 })], 0, { wholesale: false, maxDiscountPct: 10 }) ?? "",
    /below 550/
  );
});

test("cashier: wholesale customers may get the wholesale price", () => {
  assert.equal(
    cashierPricingProblem([line({ unitPrice: 500 })], 0, { wholesale: true, maxDiscountPct: 10 }),
    null
  );
});

test("cashier: line and bill discounts together are capped", () => {
  assert.match(
    cashierPricingProblem([line({ discount: 60 })], 60, { wholesale: false, maxDiscountPct: 10 }) ?? "",
    /over the cashier limit/
  );
});

test("daily numbers continue from the highest issued, not a row count", () => {
  assert.equal(nextDailyNumber("INV-20261020-", null), "INV-20261020-0001");
  assert.equal(nextDailyNumber("INV-20261020-", "INV-20261020-0004"), "INV-20261020-0005");
});

test("whatsapp: local Pakistani numbers become international", () => {
  assert.equal(whatsappLink("0300-1112233", "hi"), "https://wa.me/923001112233?text=hi");
  assert.equal(whatsappLink(null, "a b"), "https://wa.me/?text=a%20b");
});
