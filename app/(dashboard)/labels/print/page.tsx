import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, toNum } from "@/app/lib/format";
import { canEncode } from "@/app/lib/barcode";
import { Barcode } from "@/app/components/barcode";
import { PrintButton } from "@/app/components/print-button";

export const metadata = { title: "Label sheet" };

/** A sheet URL is still a URL — refuse to build an unbounded page. */
const MAX_LABELS = 480;

export default async function LabelSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; per?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/");

  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const ids = [...new Set((params.ids ? [params.ids].flat() : []).filter(Boolean))];
  const per = Math.min(24, Math.max(1, Number(params.per ?? 2) || 1));

  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      })
    : [];

  type Label = {
    key: string;
    name: string;
    code: string | null;
    price: string;
    unit: string;
  };

  const labels: Label[] = [];
  for (const product of products) {
    // The till matches on barcode first, then SKU — print whichever it has.
    const code = product.barcode ?? product.sku ?? null;
    const label: Label = {
      key: product.id,
      name: product.name,
      code: code && canEncode(code) ? code : null,
      price: formatMoney(toNum(product.price), settings.currency),
      unit: product.unit,
    };
    for (let i = 0; i < per && labels.length < MAX_LABELS; i++) {
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
      <style href="label-sheet-print" precedence="default">{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; color: #000 !important; }
          .label-sheet { border: 0 !important; padding: 0 !important; }
          .label-cell { border-color: #c9c9c9 !important; break-inside: avoid; }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/labels"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to picker
        </Link>
        <PrintButton label="Print sheet" />
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

          <div className="label-sheet rounded-xl border border-zinc-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-1">
              {labels.map((label) => (
                <div
                  key={label.key}
                  className="label-cell flex break-inside-avoid flex-col items-center gap-1 rounded-md border border-dashed border-zinc-200 p-2 text-center"
                >
                  <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-zinc-900">
                    {label.name}
                  </p>
                  {label.code ? (
                    <>
                      <Barcode value={label.code} height={8} />
                      <p className="font-mono text-[9px] tracking-tight text-zinc-900">
                        {label.code}
                      </p>
                    </>
                  ) : (
                    <p className="text-[9px] text-zinc-400">no code set</p>
                  )}
                  <p className="mt-auto text-[12px] font-bold text-zinc-900">
                    {label.price}
                    {label.unit !== "pcs" ? (
                      <span className="text-[9px] font-normal text-zinc-600">
                        /{label.unit}
                      </span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-500 print:hidden">
            {labels.length} labels · {products.length} product
            {products.length === 1 ? "" : "s"}. Print at 100% scale (no “fit to
            page”) — the bars are sized in millimetres and shrink below the
            scanner&rsquo;s minimum width if the driver rescales them.
          </p>
        </>
      )}
    </div>
  );
}
