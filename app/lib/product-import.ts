/**
 * Products from a spreadsheet: CSV parsing, column matching and row checks.
 * Pure functions, shared by the import page (preview) and the server action
 * (which checks everything again before writing).
 */

export const IMPORT_UNITS = ["pcs", "box", "kg", "ltr", "m", "yard", "cft", "hr"] as const;
export const MAX_IMPORT_ROWS = 5000;

export type ImportField =
  | "name"
  | "sku"
  | "barcode"
  | "category"
  | "unit"
  | "costPrice"
  | "price"
  | "wholesalePrice"
  | "taxRate"
  | "stockQty"
  | "reorderLevel";

/** Header spellings people actually use, lower-cased with spaces and symbols removed. */
const ALIASES: Record<ImportField, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description", "naam"],
  sku: ["sku", "code", "itemcode", "productcode", "partno", "partnumber"],
  barcode: ["barcode", "ean", "upc", "barcodeno"],
  category: ["category", "group", "type", "department"],
  unit: ["unit", "uom", "units"],
  costPrice: ["cost", "costprice", "purchaseprice", "buyprice", "buyingprice", "rate"],
  price: ["price", "saleprice", "sellingprice", "retailprice", "retail", "mrp", "salerate"],
  wholesalePrice: ["wholesale", "wholesaleprice", "tradeprice", "dealerprice"],
  taxRate: ["tax", "taxrate", "gst", "salestax", "taxpercent"],
  stockQty: ["stock", "qty", "quantity", "openingstock", "stockqty", "instock", "onhand"],
  reorderLevel: ["reorder", "reorderlevel", "minstock", "minimum", "minqty", "reorderat"],
};

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  sku: "SKU",
  barcode: "Barcode",
  category: "Category",
  unit: "Unit",
  costPrice: "Cost price",
  price: "Sale price",
  wholesalePrice: "Wholesale price",
  taxRate: "Tax %",
  stockQty: "Opening stock",
  reorderLevel: "Reorder level",
};

/** The first line of the downloadable template, in the order shown on the page. */
export const TEMPLATE_HEADER = [
  "Name",
  "SKU",
  "Barcode",
  "Category",
  "Unit",
  "Cost price",
  "Sale price",
  "Wholesale price",
  "Tax %",
  "Opening stock",
  "Reorder level",
];

/**
 * RFC 4180 CSV. The delimiter is guessed from the first line (Excel in some
 * regions saves with ";"), quoted cells may hold commas, quotes and newlines.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Excel leaves rows of empty cells below the data.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which column holds which field; unknown columns are ignored. */
export function matchColumns(header: string[]): Partial<Record<ImportField, number>> {
  const found: Partial<Record<ImportField, number>> = {};
  header.forEach((title, index) => {
    const key = squash(title);
    for (const field of Object.keys(ALIASES) as ImportField[]) {
      if (found[field] === undefined && ALIASES[field].includes(key)) {
        found[field] = index;
        return;
      }
    }
  });
  return found;
}

/**
 * null = the cell was blank. A new product then gets the default (pcs, 0 tax,
 * no stock); an existing product keeps what it has.
 */
export type ImportRow = {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  costPrice: number | null;
  price: number;
  wholesalePrice: number | null;
  taxRate: number | null;
  stockQty: number | null;
  reorderLevel: number | null;
};

export type CheckedRow = {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  /** As typed, so a line with errors can still be recognised. */
  name: string;
  row: ImportRow | null;
  errors: string[];
};

/** "Rs. 1,250.50", "1 250", "15%" → number; blank → null; anything else → NaN. */
function toNumber(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  let cleaned = s.replace(/^(rs\.?|pkr)\s*/i, "").replace(/[\s%]/g, "");
  // "1.250,50" or "12,5" (comma as the decimal mark, some Excel locales) vs "1,250" (thousands).
  if (/,\d{1,2}$/.test(cleaned) || (cleaned.includes(".") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf("."))) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

/** Turns spreadsheet lines into product rows, collecting every problem per line. */
export function checkRows(data: string[][], columns: Partial<Record<ImportField, number>>): CheckedRow[] {
  const cell = (r: string[], f: ImportField) => (columns[f] === undefined ? "" : (r[columns[f]!] ?? "").trim());
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();

  return data.map((r, index) => {
    const line = index + 2;
    const errors: string[] = [];
    const num = (f: ImportField, opts: { min?: number; max: number; decimals: number }) => {
      const v = toNumber(cell(r, f));
      if (v === null) return null;
      if (Number.isNaN(v)) {
        errors.push(`${FIELD_LABELS[f]} "${cell(r, f)}" is not a number`);
        return null;
      }
      if (v < (opts.min ?? 0) || v > opts.max) {
        errors.push(`${FIELD_LABELS[f]} ${v} is out of range`);
        return null;
      }
      const p = 10 ** opts.decimals;
      return Math.round(v * p) / p;
    };

    const name = cell(r, "name");
    if (!name) errors.push("Name is missing");
    else if (name.length > 120) errors.push("Name is longer than 120 characters");

    const sku = cell(r, "sku") || null;
    if (sku && sku.length > 40) errors.push("SKU is longer than 40 characters");
    const barcode = cell(r, "barcode") || null;
    if (barcode && barcode.length > 60) errors.push("Barcode is longer than 60 characters");
    for (const [value, seen, label] of [
      [sku, seenSku, "SKU"],
      [barcode, seenBarcode, "Barcode"],
    ] as const) {
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) errors.push(`${label} ${value} is also on line ${seen.get(key)}`);
      else seen.set(key, line);
    }

    const category = cell(r, "category").slice(0, 60) || null;
    const unitRaw = cell(r, "unit").toLowerCase();
    const unit = unitRaw === "" ? null : unitRaw;
    if (unit !== null && !(IMPORT_UNITS as readonly string[]).includes(unit)) {
      errors.push(`Unit "${cell(r, "unit")}" is not one of ${IMPORT_UNITS.join(", ")}`);
    }

    const price = num("price", { min: 0.01, max: 99_999_999, decimals: 2 });
    if (price === null && !errors.some((e) => e.startsWith("Sale price"))) errors.push("Sale price is missing");
    const costPrice = num("costPrice", { max: 99_999_999, decimals: 2 });
    const wholesalePrice = num("wholesalePrice", { min: 0.01, max: 99_999_999, decimals: 2 });
    const taxRate = num("taxRate", { max: 100, decimals: 2 });
    const stockQty = num("stockQty", { max: 9_999_999, decimals: 3 });
    const reorderLevel = num("reorderLevel", { max: 9_999_999, decimals: 3 });

    return {
      line,
      name,
      errors,
      row:
        errors.length === 0
          ? { name, sku, barcode, category, unit, costPrice, price: price!, wholesalePrice, taxRate, stockQty, reorderLevel }
          : null,
    };
  });
}

/** Header check + rows, as the page and the server both need it. */
export function readImportFile(text: string): { columns: Partial<Record<ImportField, number>>; rows: CheckedRow[]; error?: string } {
  const all = parseCsv(text);
  if (all.length < 2) return { columns: {}, rows: [], error: "The file has no product lines under the header." };
  const columns = matchColumns(all[0]);
  if (columns.name === undefined || columns.price === undefined) {
    return {
      columns,
      rows: [],
      error: 'The first line must name the columns, with at least "Name" and "Sale price". Download the template to see the layout.',
    };
  }
  const data = all.slice(1);
  if (data.length > MAX_IMPORT_ROWS) {
    return { columns, rows: [], error: `At most ${MAX_IMPORT_ROWS} products per file; split it into smaller files.` };
  }
  return { columns, rows: checkRows(data, columns) };
}
