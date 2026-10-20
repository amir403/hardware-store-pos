/**
 * Barcode sanity checks — run with: npx tsx scripts/check-barcode.ts
 *
 * A silently wrong encoder prints labels that scan as a different number, so
 * the symbol table and the checksum are validated here rather than by eye.
 *
 * The two worked examples come from a university Code 128 problem set that
 * copies the Wikipedia symbol table, and the table itself was cross-checked
 * against JsBarcode's constants — three independent sources.
 */
import {
  canEncode,
  code128SymbolIds,
  encodeCode128,
  moduleCount,
} from "../app/lib/barcode";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- Structure of every produced barcode -----------------------------------

const SAMPLES = ["5901234123457", "HNDR-0042", "0", "AB~", "Haskell!"];

for (const value of SAMPLES) {
  const runs = encodeCode128(value);
  if (!runs) {
    check(`encode ${JSON.stringify(value)}`, false, "encoder returned null");
    continue;
  }

  // start + n data + checksum + stop: (n + 2) symbols of 11 modules, plus the
  // 13-module stop pattern.
  const expected = (value.length + 2) * 11 + 13;
  check(
    `module count for ${JSON.stringify(value)}`,
    moduleCount(runs) === expected,
    `${moduleCount(runs)} vs expected ${expected}`
  );

  const bars = runs.filter((r) => r.bar).length;
  const spaces = runs.filter((r) => !r.bar).length;
  check(
    `alternates from bar to space for ${JSON.stringify(value)}`,
    runs[0].bar && runs[runs.length - 1].bar && bars === spaces + 1,
    `bars=${bars} spaces=${spaces}`
  );

  check(
    `all widths stay 1–4 modules for ${JSON.stringify(value)}`,
    runs.every((r) => r.width >= 1 && r.width <= 4),
    runs.map((r) => r.width).join("")
  );
}

check("control characters are refused", !canEncode("A\u0001B"));
check("non-ASCII (₹, emoji) is refused", encodeCode128("चाय") === null);
check("empty string is refused", encodeCode128("") === null);

// --- Published worked examples ---------------------------------------------

// "Haskell!" → check symbol 1, "CMSC 22300? HOT Programming in Haskell!" → 72
const REFERENCES: { value: string; ids: number[] }[] = [
  {
    value: "Haskell!",
    ids: [104, 40, 65, 83, 75, 69, 76, 76, 1, 1, 106],
  },
  {
    value: "CMSC 22300? HOT Programming in Haskell!",
    ids: [
      104, 35, 45, 51, 35, 0, 18, 18, 19, 16, 16, 31, 0, 40, 47, 52, 0, 48, 82,
      79, 71, 82, 65, 77, 77, 73, 78, 71, 0, 73, 78, 0, 40, 65, 83, 75, 69, 76,
      76, 1, 72, 106,
    ],
  },
];

for (const { value, ids } of REFERENCES) {
  const got = code128SymbolIds(value);
  check(
    `symbol ids for ${JSON.stringify(value)}`,
    !!got && got.join(",") === ids.join(","),
    got ? got.join(",") : "null"
  );
}

console.log(
  failures === 0 ? "\nAll barcode checks passed." : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
