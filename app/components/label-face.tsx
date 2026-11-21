import { Barcode } from "@/app/components/barcode";
import { LABEL_SIZES, type LabelSize } from "@/app/lib/print-formats";

export type LabelContent = {
  name: string;
  /** Barcode, else SKU; null when neither can be encoded. */
  code: string | null;
  /** Already formatted with the currency. */
  price: string;
  unit: string;
};

/**
 * One printed label. Shared by the printed sheet and the picker's preview so
 * the preview is exactly what comes out of the printer.
 */
export function LabelFace({ label, size }: { label: LabelContent; size: LabelSize }) {
  const roll = size === "A4" ? null : LABEL_SIZES[size];
  const unit =
    label.unit !== "pcs" ? (
      <span style={{ fontSize: roll ? "6.5pt" : "9px", fontWeight: 400 }}>/{label.unit}</span>
    ) : null;

  if (!roll) {
    return (
      <div className="label-cell flex break-inside-avoid flex-col items-center gap-1 rounded-md border border-dashed border-zinc-200 bg-white p-2 text-center">
        <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-zinc-900">{label.name}</p>
        {label.code ? (
          <>
            <Barcode value={label.code} height={8} />
            <p className="font-mono text-[9px] tracking-tight text-zinc-900">{label.code}</p>
          </>
        ) : (
          <p className="text-[9px] text-zinc-400">no code set</p>
        )}
        <p className="mt-auto text-[12px] font-bold text-zinc-900">
          {label.price}
          {unit}
        </p>
      </div>
    );
  }

  return (
    <div
      className="roll-label flex flex-col items-center justify-between overflow-hidden border border-dashed border-zinc-300 bg-white text-center text-black"
      style={{ width: `${roll.widthMm}mm`, height: `${roll.heightMm}mm`, padding: "1.2mm 1.5mm" }}
    >
      <p
        className="w-full font-bold leading-tight"
        style={{
          fontSize: roll.heightMm >= 30 ? "8pt" : "7pt",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: roll.heightMm >= 30 ? 2 : 1,
          overflow: "hidden",
        }}
      >
        {label.name}
      </p>
      {label.code ? (
        <div className="flex flex-col items-center">
          <Barcode
            value={label.code}
            // Leave room for the name and price lines.
            height={Math.min(18, Math.max(6, roll.heightMm - 15))}
            fitWidthMm={roll.widthMm - 3}
          />
          <p className="font-mono leading-none" style={{ fontSize: "6pt" }}>
            {label.code}
          </p>
        </div>
      ) : (
        <p style={{ fontSize: "6pt" }}>no code set</p>
      )}
      <p className="font-bold leading-none" style={{ fontSize: roll.widthMm >= 50 ? "10pt" : "9pt" }}>
        {label.price}
        {unit}
      </p>
    </div>
  );
}
