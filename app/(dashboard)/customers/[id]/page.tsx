import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDate, formatDateTime, formatMoney, round2, toNum } from "@/app/lib/format";
import { getCustomerBalance, invoiceSettlement } from "@/app/lib/ledger";
import { deletePaymentAction } from "@/app/actions/payments";
import { PageHeader } from "@/app/components/page-header";
import { PaymentForm, type OpenInvoice } from "@/app/components/customers/payment-form";

export const metadata = { title: "Customer account" };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE: "Mobile",
  OTHER: "Other",
};

/** One line on the statement: a bill going out or money coming in. */
type LedgerRow = {
  key: string;
  kind: "SALE" | "PAYMENT" | "RETURN";
  at: Date;
  title: string;
  subtitle: string;
  href?: string;
  charge: number;
  settlement: number;
  impact: number;
  paymentId?: string;
};

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [settings, user, customer] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "asc" },
          include: {
            items: { select: { productName: true }, take: 1 },
            _count: { select: { items: true } },
            payments: { select: { amount: true } },
            returns: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                returnNo: true,
                amount: true,
                refundAmount: true,
                createdAt: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { name: true } },
            sale: { select: { id: true, invoiceNo: true } },
          },
        },
      },
    }),
  ]);

  if (!customer) notFound();

  const balance = await getCustomerBalance(customer.id);
  const currency = settings.currency;

  // Per-invoice dues: an invoice never contributes a negative due, so an
  // overpayment shows as account credit instead of settling another bill.
  const invoices: OpenInvoice[] = [];
  const rows: LedgerRow[] = [];

  for (const sale of customer.sales) {
    const { due } = invoiceSettlement(sale);
    if (due > 0) {
      invoices.push({
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        due,
        dueDate: sale.dueDate ? formatDate(sale.dueDate) : null,
      });
    }

    const firstItem = sale.items[0];
    rows.push({
      key: `sale-${sale.id}`,
      kind: "SALE",
      at: sale.createdAt,
      title: sale.invoiceNo,
      subtitle: firstItem
        ? `${firstItem.productName}${sale._count.items > 1 ? ` + ${sale._count.items - 1} more` : ""}`
        : "Sale",
      href: `/sales/${sale.id}`,
      charge: toNum(sale.total),
      // Only what was paid at the counter: later payments get rows of their
      // own, so counting them here too would subtract them twice.
      settlement: toNum(sale.paidAmount),
      impact: round2(toNum(sale.total) - toNum(sale.paidAmount)),
    });

    // Goods brought back reduce the bill; any cash handed back for them is
    // money going out again, so only the difference moves the balance.
    for (const ret of sale.returns) {
      const refunded = toNum(ret.refundAmount);
      rows.push({
        key: `return-${ret.id}`,
        kind: "RETURN",
        at: ret.createdAt,
        title: `Return ${ret.returnNo}`,
        subtitle:
          refunded > 0
            ? `against ${sale.invoiceNo} · ${formatMoney(refunded, currency)} paid back`
            : `against ${sale.invoiceNo} · credited to account`,
        href: `/sales/${sale.id}`,
        charge: round2(-toNum(ret.amount)),
        settlement: round2(-refunded),
        impact: round2(-toNum(ret.amount) + refunded),
      });
    }
  }

  for (const payment of customer.payments) {
    rows.push({
      key: `payment-${payment.id}`,
      kind: "PAYMENT",
      at: payment.createdAt,
      title: payment.sale ? `Payment · ${payment.sale.invoiceNo}` : "Payment on account",
      subtitle: `${PAYMENT_LABELS[payment.method] ?? payment.method} · ${payment.user.name}${payment.note ? ` · ${payment.note}` : ""}`,
      href: payment.sale ? `/sales/${payment.sale.id}` : undefined,
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

  const overdue = customer.sales.filter(
    (sale) =>
      sale.dueDate &&
      sale.dueDate < new Date() &&
      invoiceSettlement(sale).due > 0
  );

  // Removing a receipt is a correction, not a daily task — admin only.
  const canDeletePayments = hasRole(user, "ADMIN");

  return (
    <>
      <div className="mb-4 print:hidden">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to customers
        </Link>
      </div>

      <PageHeader
        title={customer.name}
        description={[customer.phone, customer.email]
          .filter(Boolean)
          .join(" · ") || "No contact details on file"}
        actions={
          <Link
            href={`/customers?edit=${customer.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            <PencilIcon className="h-4 w-4" /> Edit
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Position summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Billed
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {formatMoney(balance.billed, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Collected
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {formatMoney(balance.collected, currency)}
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
                Outstanding
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
                  ? `${formatMoney(-balance.outstanding, currency)} credit`
                  : formatMoney(balance.outstanding, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Credit limit
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {customer.creditLimit === null
                  ? "No cap"
                  : formatMoney(toNum(customer.creditLimit), currency)}
              </p>
              {customer.creditLimit !== null && (
                <p className="text-xs text-zinc-400">
                  {Math.max(
                    0,
                    round2(toNum(customer.creditLimit) - balance.outstanding)
                  ).toLocaleString()} left
                </p>
              )}
            </div>
          </div>

          {overdue.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">
                {overdue.length} invoice{overdue.length === 1 ? "" : "s"} past the
                due date
              </p>
              <p className="mt-0.5 text-red-600">
                {overdue
                  .map(
                    (s) =>
                      `${s.invoiceNo} (${s.dueDate ? formatDate(s.dueDate) : "—"})`
                  )
                  .join(", ")}
              </p>
            </div>
          )}

          {/* Statement */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">Account history</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                  <th className="px-4 py-2.5 text-right font-medium">Billed</th>
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
                      {row.charge !== 0 ? formatMoney(row.charge, currency) : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        row.settlement < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {row.settlement !== 0
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
                          <form action={deletePaymentAction}>
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

        {/* Receive payment */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">
              Receive payment
            </h2>
            <PaymentForm
              customerId={customer.id}
              customerName={customer.name}
              currency={currency}
              invoices={invoices}
            />
          </div>

          {customer.address && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Address</h2>
              <p className="text-zinc-600">{customer.address}</p>
            </div>
          )}
          {customer.notes && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Notes</h2>
              <p className="text-zinc-600">{customer.notes}</p>
            </div>
          )}
          <p className="px-1 text-xs text-zinc-400">
            Account opened {formatDateTime(customer.createdAt)} ·{" "}
            {customer.sales.length} completed sale
            {customer.sales.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </>
  );
}
