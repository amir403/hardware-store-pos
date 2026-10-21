import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, formatDateTime, formatQty, toNum } from "@/app/lib/format";
import { purchaseSettlement } from "@/app/lib/payables";
import { PrintButton } from "@/app/components/print-button";
import { FlashToast } from "@/app/components/toast";

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
        supplier: { select: { id: true, name: true } },
        user: { select: { name: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, amount: true, method: true, createdAt: true },
        },
      },
    }),
    getSettings(),
  ]);

  if (!purchase) notFound();

  const { paid, due } = purchaseSettlement(purchase);

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
        <FlashToast
          message="Purchase recorded — stock updated"
          clearParams={["new"]}
        />
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
            {purchase.supplier ? (
              <Link
                href={`/suppliers/${purchase.supplier.id}`}
                className="text-zinc-900 hover:underline"
              >
                {purchase.supplier.name}
              </Link>
            ) : (
              <span className="text-zinc-900">—</span>
            )}
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
          <div className="flex justify-between text-zinc-500">
            <span>Paid at purchase</span>
            <span>
              {formatMoney(toNum(purchase.paidAmount), settings.currency)}
            </span>
          </div>
          {purchase.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex justify-between text-zinc-500"
            >
              <span>Paid {formatDate(payment.createdAt)}</span>
              <span>{formatMoney(toNum(payment.amount), settings.currency)}</span>
            </div>
          ))}
          {due > 0 ? (
            <>
              <div className="flex justify-between border-t border-dashed border-amber-300 pt-1.5 font-semibold text-amber-700">
                <span>Still owed</span>
                <span>{formatMoney(due, settings.currency)}</span>
              </div>
              {purchase.dueDate && (
                <p className="text-right text-xs text-amber-700">
                  payable by {formatDate(purchase.dueDate)}
                </p>
              )}
            </>
          ) : (
            paid > 0 && (
              <p className="text-right text-xs font-medium text-emerald-700">
                Fully paid
              </p>
            )
          )}
        </div>

        {due > 0 && purchase.supplier && (
          <div className="mt-4 text-right print:hidden">
            <Link
              href={`/suppliers/${purchase.supplier.id}`}
              className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Pay {purchase.supplier.name}
            </Link>
          </div>
        )}

        {purchase.note && (
          <p className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
            Note: {purchase.note}
          </p>
        )}
      </div>
    </div>
  );
}
