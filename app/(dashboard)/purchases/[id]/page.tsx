import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, formatQty, toNum } from "@/app/lib/format";
import { PrintButton } from "@/app/components/print-button";

export const metadata = { title: "Purchase detail" };

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isNew = sp.new === "1";

  const [purchase, settings] = await Promise.all([
    prisma.purchase.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { name: true } } } },
        supplier: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    getSettings(),
  ]);

  if (!purchase) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to purchases
        </Link>
        <PrintButton />
      </div>

      {isNew && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 print:hidden">
          <CheckCircle2Icon className="h-5 w-5" />
          Purchase recorded — stock has been updated.
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-8 print:border-0 print:shadow-none">
        <div className="border-b border-dashed border-zinc-200 pb-4 text-center">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">
            Purchase Note
          </h1>
          <p className="text-xs text-zinc-500">{settings.storeName}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-zinc-200 py-4 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Reference</span>
            <span className="font-semibold text-zinc-900">
              {purchase.referenceNo ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Date</span>
            <span className="text-zinc-900">
              {formatDateTime(purchase.createdAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Supplier</span>
            <span className="text-zinc-900">
              {purchase.supplier?.name ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Received by</span>
            <span className="text-zinc-900">
              {purchase.user?.name ?? "—"}
            </span>
          </div>
        </div>

        <table className="w-full py-2 text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 text-left font-medium">Product</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit cost</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100">
                <td className="py-2 pr-2 text-zinc-900">
                  {item.product.name}
                </td>
                <td className="py-2 text-right text-zinc-600">
                  {formatQty(toNum(item.quantity))}
                </td>
                <td className="py-2 text-right text-zinc-600">
                  {formatMoney(toNum(item.unitCost), settings.currency)}
                </td>
                <td className="py-2 text-right font-medium text-zinc-900">
                  {formatMoney(toNum(item.lineTotal), settings.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
            <span>Total</span>
            <span>{formatMoney(toNum(purchase.total), settings.currency)}</span>
          </div>
        </div>

        {purchase.note && (
          <p className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
            Note: {purchase.note}
          </p>
        )}
      </div>
    </div>
  );
}
