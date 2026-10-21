import { Barcode } from "@/app/components/barcode";
import { RECEIPT_PAPERS } from "@/app/lib/print-formats";

export type ThermalLine = {
  name: string;
  qty: string;
  price: string;
  total: string;
  /** Shown under the line when the item was discounted. */
  discount?: string;
};

export type ThermalRow = { label: string; value: string; strong?: boolean };

/**
 * A receipt laid out for an 80 mm or 58 mm thermal roll: pure black, one
 * column, sized in millimetres. It is hidden on screen and is the only thing
 * that prints, so the regular on-screen receipt can stay as it is.
 *
 * In the print dialog choose the roll's paper size, margins "None" and scale
 * 100%; the roll is cut wherever the content ends.
 */
export function ThermalReceipt({
  paper,
  store,
  title,
  meta,
  lines,
  totals,
  notices = [],
  barcode,
  footer,
}: {
  paper: "80mm" | "58mm";
  store: { name: string; address: string | null; phone: string | null };
  title: string;
  meta: ThermalRow[];
  lines: ThermalLine[];
  totals: ThermalRow[];
  /** Short blocks printed after the totals (status, payment reminder, notes). */
  notices?: string[];
  /** Encoded at the bottom so the bill can be scanned back up. */
  barcode?: string;
  footer?: string | null;
}) {
  const widthMm = RECEIPT_PAPERS[paper].contentMm;
  const small = paper === "58mm";

  return (
    <>
      {/* Scoped to pages that render a thermal receipt. */}
      <style href={`thermal-receipt-${paper}`} precedence="default">{`
        @page { size: ${paper === "80mm" ? "80mm" : "58mm"} auto; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
        }
      `}</style>

      <div
        className="thermal-receipt hidden bg-white text-black print:block"
        style={{
          width: `${widthMm}mm`,
          margin: "0 auto",
          padding: "3mm 0 6mm",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: small ? "8pt" : "9pt",
          lineHeight: 1.3,
          color: "#000",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: small ? "11pt" : "13pt", fontWeight: 700 }}>
            {store.name}
          </p>
          {store.address && <p>{store.address}</p>}
          {store.phone && <p>Tel: {store.phone}</p>}
          <p
            style={{
              marginTop: "2mm",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </p>
        </div>

        <Rule />

        {meta.map((row) => (
          <Row key={row.label} row={row} />
        ))}

        <Rule />

        {lines.map((line, index) => (
          <div key={index} style={{ marginBottom: "1.2mm", breakInside: "avoid" }}>
            <p style={{ fontWeight: 600 }}>{line.name}</p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm" }}>
              <span>
                {line.qty} × {line.price}
              </span>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{line.total}</span>
            </div>
            {line.discount && <p style={{ fontSize: "0.9em" }}>  discount −{line.discount}</p>}
          </div>
        ))}

        <Rule />

        {totals.map((row) => (
          <Row key={row.label} row={row} />
        ))}

        {notices.map((text, index) => (
          <div key={index}>
            <Rule />
            <p style={{ whiteSpace: "pre-line" }}>{text}</p>
          </div>
        ))}

        {barcode && (
          <div style={{ marginTop: "3mm", display: "flex", justifyContent: "center" }}>
            <Barcode value={barcode} height={small ? 8 : 10} fitWidthMm={widthMm} />
          </div>
        )}

        {footer && (
          <p style={{ marginTop: "2mm", textAlign: "center" }}>{footer}</p>
        )}
      </div>
    </>
  );
}

function Rule() {
  return <div style={{ borderTop: "1px dashed #000", margin: "1.8mm 0" }} />;
}

function Row({ row }: { row: ThermalRow }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "2mm",
        fontWeight: row.strong ? 700 : 400,
        fontSize: row.strong ? "1.15em" : undefined,
      }}
    >
      <span>{row.label}</span>
      <span style={{ textAlign: "right" }}>{row.value}</span>
    </div>
  );
}
