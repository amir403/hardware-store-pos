import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDate, formatDateTime, formatMoney, round2, toNum } from "@/app/lib/format";
import { getSupplierBalance, purchaseSettlement } from "@/app/lib/payables";
import { deleteSupplierPaymentAction } from "@/app/actions/supplier-payments";
import { PageHeader } from "@/app/components/page-header";
import {
  SupplierPaymentForm,
  type OpenPurchase,
} from "@/app/components/suppliers/supplier-payment-form";

export const metadata = { title: "Supplier account" };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE: "Mobile",
  OTHER: "Other",
};

/** One line on the statement: a purchase coming in or money going out. */
type LedgerRow = {
  key: string;
  kind: "PURCHASE" | "PAYMENT";
  at: Date;
  title: string;
  subtitle: string;
  href?: string;
  charge: number;
  settlement: number;
  impact: number;
  paymentId?: string;
};

function purchaseLabel(purchase: { referenceNo: string | null; createdAt: Date }) {
  return purchase.referenceNo ?? `Purchase ${formatDate(purchase.createdAt)}`;
}

export default async function SupplierAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const { id } = await params;

  const [settings, supplier] = await Promise.all([
    getSettings(),
    prisma.supplier.findUnique({
      where: { id },
      include: {
        purchases: {
          orderBy: { createdAt: "asc" },
          include: {
            items: {
              select: { product: { select: { name: true } } },
              take: 1,
            },
            _count: { select: { items: true } },
            payments: { select: { amount: true } },
          },
        },
        payments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { name: true } },
            purchase: {
              select: { id: true, referenceNo: true, createdAt: true },
            },
          },
        },
      },
    }),
  ]);

  if (!supplier) notFound();

  const balance = await getSupplierBalance(supplier.id);
  const currency = settings.currency;

  const openPurchases: OpenPurchase[] = [];
  const rows: LedgerRow[] = [];
  const now = new Date();
  const overdue: { label: string; dueDate: Date }[] = [];

  for (const purchase of supplier.purchases) {
    const { due } = purchaseSettlement(purchase);
    if (due > 0) {
      openPurchases.push({
        id: purchase.id,
        label: purchaseLabel(purchase),
        due,
        dueDate: purchase.dueDate ? formatDate(purchase.dueDate) : null,
      });
      if (purchase.dueDate && purchase.dueDate < now) {
        overdue.push({ label: purchaseLabel(purchase), dueDate: purchase.dueDate });
      }
    }

    const firstItem = purchase.items[0];
    rows.push({
      key: `purchase-${purchase.id}`,
      kind: "PURCHASE",
      at: purchase.createdAt,
      title: purchaseLabel(purchase),
      subtitle: firstItem
        ? `${firstItem.product.name}${purchase._count.items > 1 ? ` + ${purchase._count.items - 1} more` : ""}`
        : "Purchase",
      href: `/purchases/${purchase.id}`,
      charge: toNum(purchase.total),
      // Only what was paid on the day: later payments get rows of their own,
      // so counting them here too would subtract them twice.
      settlement: toNum(purchase.paidAmount),
      impact: round2(toNum(purchase.total) - toNum(purchase.paidAmount)),
    });
  }

  for (const payment of supplier.payments) {
    rows.push({
      key: `payment-${payment.id}`,
      kind: "PAYMENT",
      at: payment.createdAt,
      title: payment.purchase
        ? `Payment · ${purchaseLabel(payment.purchase)}`
        : "Payment on account",
      subtitle: `${PAYMENT_LABELS[payment.method] ?? payment.method} · ${payment.user.name}${payment.note ? ` · ${payment.note}` : ""}`,
      href: payment.purchase ? `/purchases/${payment.purchase.id}` : undefined,
      charge: 0,
      settlement: toNum(payment.amount),
      impact: round2(-toNum(payment.amount)),
      paymentId: payment.id,
    });
  }

  rows.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Running balance, oldest first — ends at the same figure the header shows.
  let running = 0;
  const withBalance = rows.map((row) => {
    running = round2(running + row.impact);
    return { ...row, balance: running };
  });

  const canDeletePayments = hasRole(user, "ADMIN");

  return (
    <>
      <div className="mb-4 print:hidden">
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to suppliers
        </Link>
      </div>

      <PageHeader
        title={supplier.name}
        description={
          [supplier.phone, supplier.email].filter(Boolean).join(" · ") ||
          "No contact details on file"
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/suppliers?edit=${supplier.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <PencilIcon className="h-4 w-4" /> Edit
            </Link>
            <Link
              href={`/purchases/new?supplier=${supplier.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              <PlusIcon className="h-4 w-4" /> New purchase
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Position summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Purchased
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {formatMoney(balance.purchased, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Paid
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {formatMoney(balance.paid, currency)}
              </p>
            </div>
            <div
              className={`rounded-xl border p-4 ${
                balance.outstanding > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                We owe
              </p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  balance.outstanding > 0
                    ? "text-amber-700"
                    : balance.outstanding < 0
                      ? "text-emerald-700"
                      : "text-zinc-900"
                }`}
              >
                {balance.outstanding < 0
                  ? `${formatMoney(-balance.outstanding, currency)} advance`
                  : formatMoney(balance.outstanding, currency)}
              </p>
            </div>
          </div>

          {overdue.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">
                {overdue.length} purchase{overdue.length === 1 ? "" : "s"} past
                the due date
              </p>
              <p className="mt-0.5 text-red-600">
                {overdue
                  .map((p) => `${p.label} (${formatDate(p.dueDate)})`)
                  .join(", ")}
              </p>
            </div>
          )}

          {/* Statement */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Account history
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                  <th className="px-4 py-2.5 text-right font-medium">Purchased</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {withBalance.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      Nothing on this account yet.
                    </td>
                  </tr>
                )}
                {withBalance.map((row) => (
                  <tr key={row.key} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {formatDate(row.at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {row.title}
                        </Link>
                      ) : (
                        <p className="font-medium text-zinc-900">{row.title}</p>
                      )}
                      <p className="text-xs text-zinc-400">{row.subtitle}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700">
                      {row.charge > 0 ? formatMoney(row.charge, currency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {row.settlement > 0
                        ? formatMoney(row.settlement, currency)
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        row.balance > 0 ? "text-amber-700" : "text-zinc-900"
                      }`}
                    >
                      {formatMoney(row.balance, currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.kind === "PAYMENT" &&
                        canDeletePayments &&
                        row.paymentId && (
                          <form action={deleteSupplierPaymentAction}>
                            <input
                              type="hidden"
                              name="id"
                              value={row.paymentId}
                            />
                            <button
                              type="submit"
                              title="Remove payment"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pay supplier */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">
              Pay supplier
            </h2>
            <SupplierPaymentForm
              supplierId={supplier.id}
              supplierName={supplier.name}
              currency={currency}
              purchases={openPurchases}
            />
          </div>

          {supplier.address && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Address</h2>
              <p className="text-zinc-600">{supplier.address}</p>
            </div>
          )}
          {supplier.notes && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Notes</h2>
              <p className="text-zinc-600">{supplier.notes}</p>
            </div>
          )}
          <p className="px-1 text-xs text-zinc-400">
            Supplier added {formatDateTime(supplier.createdAt)} ·{" "}
            {supplier.purchases.length} purchase
            {supplier.purchases.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </>
  );
}
