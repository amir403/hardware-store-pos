// Client-safe: no database imports. Shared by settings, receipts and labels.

/** Receipt paper. Thermal rolls print narrower than their nominal width. */
export const RECEIPT_PAPERS = {
  "80mm": { label: "80 mm thermal roll", contentMm: 72 },
  "58mm": { label: "58 mm thermal roll", contentMm: 48 },
  A4: { label: "A4 / normal printer", contentMm: 0 },
} as const;

export type ReceiptPaper = keyof typeof RECEIPT_PAPERS;

export function isReceiptPaper(value: string): value is ReceiptPaper {
  return value in RECEIPT_PAPERS;
}

/** Label stock. Roll sizes print one label per page at the label's size. */
export const LABEL_SIZES = {
  A4: { label: "A4 sheet (3 across)", widthMm: 0, heightMm: 0 },
  "50x25": { label: "50 × 25 mm roll", widthMm: 50, heightMm: 25 },
  "40x30": { label: "40 × 30 mm roll", widthMm: 40, heightMm: 30 },
  "38x25": { label: "38 × 25 mm roll", widthMm: 38, heightMm: 25 },
  "58x40": { label: "58 × 40 mm roll", widthMm: 58, heightMm: 40 },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;

export function isLabelSize(value: string): value is LabelSize {
  return value in LABEL_SIZES;
}
