import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, toNum } from "@/app/lib/format";
import { canEncode } from "@/app/lib/barcode";
import { LabelFace, type LabelContent } from "@/app/components/label-face";
import { PrintButton } from "@/app/components/print-button";
import { LABEL_SIZES, isLabelSize } from "@/app/lib/print-formats";
import { MAX_LABELS, encodeLabelItem, parseLabelItems } from "@/app/lib/labels";

export const metadata = { title: "Label sheet" };

export default async function LabelSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string | string[]; ids?: string | string[]; per?: string; size?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  // `l=id:count` per product; older links sent `ids` with one `per` for all.
  const per = Math.min(24, Math.max(1, Number(params.per ?? 2) || 1));
  const items = params.l
    ? parseLabelItems(params.l)
    : [...new Set((params.ids ? [params.ids].flat() : []).filter(Boolean))].map((id) => ({ id, count: per }));
  const counts = new Map(items.map((item) => [item.id, item.count]));
  const ids = [...counts.keys()];
  const size =
    params.size && isLabelSize(params.size) ? params.size : settings.labelSize;
  const roll = size === "A4" ? null : LABEL_SIZES[size];
  // Back to the picker with the same ticks, counts and size.
  const back = `/labels?${new URLSearchParams([
    ...items.map((item): [string, string] => ["l", encodeLabelItem(item.id, item.count)]),
    ["size", size],
  ])}`;

  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      })
    : [];

  const labels: (LabelContent & { key: string })[] = [];
  for (const product of products) {
    // The till matches on barcode first, then SKU — print whichever it has.
    const code = product.barcode ?? product.sku ?? null;
    const label: LabelContent = {
      name: product.name,
      code: code && canEncode(code) ? code : null,
      price: formatMoney(toNum(product.price), settings.currency),
      unit: product.unit,
    };
    for (let i = 0; i < (counts.get(product.id) ?? 1) && labels.length < MAX_LABELS; i++) {
      labels.push({ ...label, key: `${product.id}-${i}` });
    }
  }

  const blocked = products.filter((p) => !(p.barcode ?? p.sku));

  return (
    <div className="mx-auto max-w-5xl">
      {/*
        Scoped to this route only: a global @page rule in globals.css would also
        force the 80 mm receipt onto A4.
      */}
      {roll ? (
        <style href={`label-roll-${size}`} precedence="default">{`
          @page { size: ${roll.widthMm}mm ${roll.heightMm}mm; margin: 0; }
          @media print {
            html, body { background: #fff !important; color: #000 !important; }
            .label-roll { display: block !important; gap: 0 !important; padding: 0 !important; border: 0 !important; }
            .label-roll .roll-label { border: 0 !important; margin: 0 !important; break-after: page; }
            .label-roll .roll-label:last-child { break-after: auto; }
          }
        `}</style>
      ) : (
        <style href="label-sheet-print" precedence="default">{`
          @page { size: A4 portrait; margin: 8mm; }
          @media print {
            html, body { background: #fff !important; color: #000 !important; }
            .label-sheet { border: 0 !important; padding: 0 !important; }
            .label-cell { border-color: #c9c9c9 !important; break-inside: avoid; }
          }
        `}</style>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={back}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to picker
        </Link>
        <PrintButton label={roll ? "Print labels" : "Print sheet"} />
      </div>

      {labels.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-400 print:hidden">
          Nothing to print. Go back and tick at least one product that has a
          barcode or SKU.
        </div>
      ) : (
        <>
          {blocked.length > 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
              {blocked.length} selected product{blocked.length === 1 ? "" : "s"}{" "}
              have no barcode or SKU, so no label was made for{" "}
              {blocked.map((p) => p.name).join(", ")}.
            </p>
          )}

          {roll ? (
            <div className="label-roll flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-100 p-4">
              {labels.map((label) => (
                <LabelFace key={label.key} label={label} size={size} />
              ))}
            </div>
          ) : (
            <div className="label-sheet rounded-xl border border-zinc-200 bg-white p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-1">
                {labels.map((label) => (
                  <LabelFace key={label.key} label={label} size={size} />
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-zinc-500 print:hidden">
            {labels.length} labels · {products.length} product
            {products.length === 1 ? "" : "s"} · {LABEL_SIZES[size].label}.{" "}
            {roll
              ? `In the print dialog pick the ${roll.widthMm} × ${roll.heightMm} mm label paper, margins "None" and scale 100% — each label prints as its own page.`
              : "Print at 100% scale (no “fit to page”) — the bars are sized in millimetres and shrink below the scanner’s minimum width if the driver rescales them."}
          </p>
        </>
      )}
    </div>
  );
}
