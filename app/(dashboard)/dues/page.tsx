import Link from "next/link";
import { redirect } from "next/navigation";
import { BanknoteIcon, CalendarClockIcon, PrinterIcon, UsersIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, round2, toNum } from "@/app/lib/format";
import { getCustomerBalances } from "@/app/lib/ledger";
import { PageHeader } from "@/app/components/page-header";
import { PrintButton } from "@/app/components/print-button";

export const metadata = { title: "Credits & dues" };

/** How late an invoice is, in whole days. Undated invoices never age. */
function daysOverdue(dueDate: Date | null, today: Date): number | null {
  if (!dueDate) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return Math.round((startOfToday.getTime() - startOfDue.getTime()) / 86_400_000);
}

const BUCKETS = [
  { key: "current", label: "Not yet due", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "d7", label: "1–7 days late", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "d30", label: "8–30 days late", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "d90", label: "31–90 days late", tone: "bg-red-50 text-red-700 border-red-200" },
  { key: "over90", label: "90+ days late", tone: "bg-red-100 text-red-800 border-red-300" },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];

function bucketFor(days: number | null): BucketKey {
  if (days === null || days <= 0) return "current";
  if (days <= 7) return "d7";
  if (days <= 30) return "d30";
  if (days <= 90) return "d90";
  return "over90";
}

const BUCKET_STYLES: Record<BucketKey, string> = Object.fromEntries(
  BUCKETS.map((b) => [b.key, b.tone])
) as Record<BucketKey, string>;

const BUCKET_LABELS: Record<BucketKey, string> = Object.fromEntries(
  BUCKETS.map((b) => [b.key, b.label])
) as Record<BucketKey, string>;

export default async function DuesPage() {
  // The nav hides this from cashiers; guard the route itself as well.
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const settings = await getSettings();
  const now = new Date();

  const [customers, sales] = await Promise.all([
    prisma.customer.findMany({
      where: { sales: { some: { status: "COMPLETED" } } },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", customerId: { not: null } },
      select: {
        id: true,
        invoiceNo: true,
        total: true,
        paidAmount: true,
        dueDate: true,
        createdAt: true,
        customerId: true,
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
  ]);

  const balances = await getCustomerBalances(customers.map((c) => c.id));

  // Only invoices that still have money against them belong on this page.
  const openInvoices = sales
    .map((sale) => {
      const settled = round2(
        toNum(sale.paidAmount) +
          sale.payments.reduce((sum, p) => sum + toNum(p.amount), 0)
      );
      const days = daysOverdue(sale.dueDate, now);
      return {
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        customerId: sale.customerId!,
        customerName: sale.customer?.name ?? "—",
        billed: toNum(sale.total),
        settled,
        due: round2(toNum(sale.total) - settled),
        dueDate: sale.dueDate,
        createdAt: sale.createdAt,
        days,
        bucket: bucketFor(days),
      };
    })
    .filter((invoice) => invoice.due > 0)
    // Worst first: most overdue days, then biggest amount.
    .sort(
      (a, b) =>
        (b.days ?? -1) - (a.days ?? -1) ||
        b.due - a.due ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );

  const totalsByBucket = BUCKETS.reduce<Record<BucketKey, { amount: number; count: number }>>(
    (acc, bucket) => {
      acc[bucket.key] = { amount: 0, count: 0 };
      return acc;
    },
    {} as Record<BucketKey, { amount: number; count: number }>
  );
  for (const invoice of openInvoices) {
    const entry = totalsByBucket[invoice.bucket];
    entry.amount = round2(entry.amount + invoice.due);
    entry.count += 1;
  }

  const totalDue = round2(openInvoices.reduce((sum, i) => sum + i.due, 0));
  const overdueTotal = round2(
    BUCKETS.filter((b) => b.key !== "current").reduce(
      (sum, b) => sum + totalsByBucket[b.key].amount,
      0
    )
  );
  const overdueCount = BUCKETS.filter((b) => b.key !== "current").reduce(
    (sum, b) => sum + totalsByBucket[b.key].count,
    0
  );

  // Accounts are ranked by what they owe, not by invoice count — that is the
  // order a shopkeeper actually walks down the list in.
  const accounts = customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      creditLimit: customer.creditLimit,
      outstanding: balances.get(customer.id)?.outstanding ?? 0,
      invoices: openInvoices.filter((i) => i.customerId === customer.id),
    }))
    .filter((account) => account.outstanding > 0 || account.invoices.length > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const cards: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
    alert?: boolean;
  }[] = [
    {
      label: "Total out on credit",
      value: formatMoney(totalDue, settings.currency),
      sub: `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`,
      icon: BanknoteIcon,
    },
    {
      label: "Overdue",
      value: formatMoney(overdueTotal, settings.currency),
      sub: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} past their date`,
      icon: CalendarClockIcon,
      alert: overdueTotal > 0,
    },
    {
      label: "Accounts to chase",
      value: String(accounts.length),
      sub: "customers with an open balance",
      icon: UsersIcon,
    },
  ];

  return (
    <>
      <PageHeader
        title="Credits & dues"
        description="Every invoice sold on udhaar, oldest debt first"
        actions={<PrintButton label="Print list" />}
      />

      {openInvoices.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">
            Nobody owes anything right now.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Credit sales will appear here until they are settled from the
            customer&apos;s account page.
          </p>
          <Link
            href="/pos"
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New sale
          </Link>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`rounded-xl border bg-white p-5 ${
                    card.alert ? "border-red-200" : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-500">{card.label}</p>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-2xl font-semibold tracking-tight ${
                      card.alert ? "text-red-700" : "text-zinc-900"
                    }`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{card.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Aging spread */}
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            {BUCKETS.map((bucket) => {
              const entry = totalsByBucket[bucket.key];
              if (entry.count === 0) return null;
              return (
                <span
                  key={bucket.key}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${bucket.tone}`}
                >
                  {bucket.label}
                  <span className="font-semibold">
                    {formatMoney(entry.amount, settings.currency)}
                  </span>
                  <span className="opacity-70">· {entry.count}</span>
                </span>
              );
            })}
          </div>

          {/* Open invoices */}
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Open invoices
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Sold</th>
                  <th className="px-4 py-2.5 font-medium">Payable by</th>
                  <th className="px-4 py-2.5 text-right font-medium">Billed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {openInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/sales/${invoice.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {invoice.invoiceNo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/customers/${invoice.customerId}`}
                        className="text-zinc-700 hover:underline"
                      >
                        {invoice.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                      {formatDate(invoice.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                      {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {formatMoney(invoice.billed, settings.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">
                      {formatMoney(invoice.settled, settings.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-amber-700">
                      {formatMoney(invoice.due, settings.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${BUCKET_STYLES[invoice.bucket]}`}
                      >
                        {invoice.days && invoice.days > 0
                          ? `${invoice.days}d late`
                          : BUCKET_LABELS[invoice.bucket]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold text-zinc-900">
                  <td className="px-4 py-3" colSpan={6}>
                    {openInvoices.length} open invoice
                    {openInvoices.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(totalDue, settings.currency)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per-account view — what to knock on each door for */}
          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                By customer
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 text-right font-medium">Open bills</th>
                  <th className="px-4 py-2.5 text-right font-medium">Owes</th>
                  <th className="px-4 py-2.5 font-medium">Credit limit</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {accounts.map((account) => {
                  const limit =
                    account.creditLimit === null ? null : toNum(account.creditLimit);
                  const atLimit =
                    limit !== null && account.outstanding >= limit;
                  return (
                    <tr key={account.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">
                        {account.name}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-600">
                        {account.phone ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-600">
                        {account.invoices.length}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-amber-700">
                        {formatMoney(account.outstanding, settings.currency)}
                      </td>
                      <td className="px-4 py-2.5">
                        {limit === null ? (
                          <span className="text-zinc-400">No cap</span>
                        ) : (
                          <span
                            className={atLimit ? "font-medium text-red-700" : "text-zinc-600"}
                          >
                            {formatMoney(limit, settings.currency)}
                            {atLimit ? " · reached" : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/customers/${account.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 print:hidden"
                        >
                          <PrinterIcon className="h-3.5 w-3.5" />
                          Ledger &amp; receive
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-zinc-400 print:hidden">
            Balances are derived from invoices and payments, so a refund, void or
            part payment moves these figures immediately. Printing this page
            gives the counter a reminder list for the day.
          </p>
        </>
      )}
    </>
  );
}
