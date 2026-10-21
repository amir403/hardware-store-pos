import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  BanIcon,
  PackageOpenIcon,
  PauseCircleIcon,
  Undo2Icon,
} from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  round2,
  toNum,
} from "@/app/lib/format";
import { invoiceSettlement } from "@/app/lib/ledger";
import { PrintButton } from "@/app/components/print-button";
import { RefundButton } from "@/app/components/sales/refund-button";
import { VoidButton } from "@/app/components/sales/void-button";
import { FlashToast } from "@/app/components/toast";
import { ThermalReceipt } from "@/app/components/thermal-receipt";

export const metadata = { title: "Sale detail" };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE: "Mobile",
  OTHER: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  HELD: "On hold",
  REFUNDED: "Refunded",
  VOID: "Void",
};

/** Only the statuses that invalidate a receipt get stamped on the paper. */
const STATUS_WATERMARKS: Record<string, string> = {
  HELD: "text-amber-600",
  REFUNDED: "text-red-600",
  VOID: "text-zinc-500",
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; returned?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isNew = sp.new === "1";
  const justReturned = sp.returned ?? null;

  const [sale, settings, user] = await Promise.all([
    prisma.sale.findUnique({
      where: { id },
      include: {
        items: { orderBy: { productName: "asc" } },
        user: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        // Ledger payments count towards this invoice's balance, so a receipt
        // reprinted after a part payment must not still demand the full amount.
        payments: { select: { amount: true } },
        returns: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { name: true } },
            items: {
              select: {
                id: true,
                quantity: true,
                amount: true,
                saleItem: { select: { productName: true } },
              },
            },
          },
        },
      },
    }),
    getSettings(),
    getCurrentUser(),
  ]);

  if (!sale) notFound();

  const {
    due: balanceDue,
    netTotal,
    returned,
    refunded,
  } = invoiceSettlement(sale);

  const soldQty = round2(
    sale.items.reduce((sum, item) => sum + toNum(item.quantity), 0)
  );
  const totalReturnedQty = round2(
    sale.returns.reduce(
      (sum, ret) =>
        sum + ret.items.reduce((s, item) => s + toNum(item.quantity), 0),
      0
    )
  );
  const hasReturns = sale.returns.length > 0;

  // Refunds reverse both stock and revenue, so they stay with the managers.
  const canManage = hasRole(user, "ADMIN", "MANAGER");
  // Once some goods have come back, the rest go back the same way — a full
  // refund or void on top would restock the returned items twice.
  const canRefund = sale.status === "COMPLETED" && canManage && !hasReturns;
  const canReturn =
    sale.status === "COMPLETED" && canManage && totalReturnedQty < soldQty;
  // A void only corrects today's entry; yesterday is already reported.
  const canVoid =
    sale.status === "COMPLETED" &&
    canManage &&
    !hasReturns &&
    isSameDay(sale.createdAt, new Date());

  const currency = settings.currency;
  // On a thermal printer the narrow receipt below is what prints; the page
  // itself (including this on-screen receipt) stays screen-only.
  const thermal = settings.receiptPaper !== "A4" ? settings.receiptPaper : null;
  const STATUS_NOTICE: Record<string, string> = {
    HELD: "*** ON HOLD — NOT A VALID RECEIPT ***",
    REFUNDED: "*** REFUNDED ***",
    VOID: "*** VOID ***",
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className={thermal ? "print:hidden" : undefined}>
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link
            href="/sales"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Back to sales
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PrintButton />
            {canReturn && (
              <Link
                href={`/sales/${sale.id}/return`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                <PackageOpenIcon className="h-4 w-4" />
                Return items
              </Link>
            )}
            {canRefund && (
              <RefundButton
                saleId={sale.id}
                invoiceNo={sale.invoiceNo}
                total={formatMoney(toNum(sale.total), settings.currency)}
              />
            )}
            {canVoid && (
              <VoidButton saleId={sale.id} invoiceNo={sale.invoiceNo} />
            )}
            <Link
              href="/pos"
              className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              New sale
            </Link>
          </div>
        </div>

        {isNew && (
          <FlashToast
            message={`${sale.invoiceNo} completed — stock updated`}
            clearParams={["new"]}
          />
        )}
        {justReturned && (
          <FlashToast
            message={`Return ${justReturned} recorded — items are back in stock`}
            clearParams={["returned"]}
          />
        )}

        {sale.status === "HELD" && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 print:hidden">
            <PauseCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              This bill is on hold — stock has not been deducted and it is not
              counted as revenue. Recall it from the New Sale screen to complete
              it.
            </span>
          </div>
        )}

        {sale.status === "REFUNDED" && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <Undo2Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              REFUNDED — every tracked item on this receipt went back into stock
              and this sale is excluded from revenue reports.
            </span>
          </div>
        )}

        {sale.status === "VOID" && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700">
            <BanIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              VOID — this entry was cancelled and its stock returned. It is kept
              only so today&apos;s invoice sequence still adds up.
            </span>
          </div>
        )}

        {/* Receipt */}
        <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-8 print:border-0 print:shadow-none">
          {/* Status watermark — deliberately NOT print:hidden, so a parked,
              refunded or voided copy can never be handed over as a valid sale. */}
          {STATUS_WATERMARKS[sale.status] && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className={`-rotate-[18deg] text-[6rem] font-black tracking-widest opacity-[0.07] print:opacity-15 ${
                  STATUS_WATERMARKS[sale.status]
                }`}
              >
                {sale.status}
              </span>
            </div>
          )}
          {/* Store header */}
          <div className="border-b border-dashed border-zinc-200 pb-4 text-center">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900">
              {settings.storeName}
            </h1>
            {settings.address && (
              <p className="text-xs text-zinc-500">{settings.address}</p>
            )}
            {settings.phone && (
              <p className="text-xs text-zinc-500">Tel: {settings.phone}</p>
            )}
          </div>

          {/* Invoice meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-zinc-200 py-4 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Invoice</span>
              <span className="font-semibold text-zinc-900">
                {sale.invoiceNo}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Date</span>
              <span className="text-zinc-900">
                {formatDateTime(sale.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Cashier</span>
              <span className="text-zinc-900">{sale.user.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer</span>
              <span className="text-zinc-900">
                {sale.customer?.name ?? "Walk-in"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Payment</span>
              <span className="text-zinc-900">
                {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Status</span>
              <span className="text-zinc-900">
                {STATUS_LABELS[sale.status] ?? sale.status}
              </span>
            </div>
          </div>

          {/* Items */}
          <table className="w-full py-2 text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 text-left font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-2 text-zinc-900">
                    {item.productName}
                    {toNum(item.discount) > 0 && (
                      <span className="block text-[11px] text-zinc-400">
                        discount {formatMoney(toNum(item.discount), settings.currency)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-zinc-600">
                    {formatQty(toNum(item.quantity))}
                  </td>
                  <td className="py-2 text-right text-zinc-600">
                    {formatMoney(toNum(item.unitPrice), settings.currency)}
                  </td>
                  <td className="py-2 text-right font-medium text-zinc-900">
                    {formatMoney(toNum(item.lineTotal), settings.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>{formatMoney(toNum(sale.subtotal), settings.currency)}</span>
            </div>
            {toNum(sale.discountAmount) > 0 && (
              <div className="flex justify-between text-zinc-500">
                <span>Discount</span>
                <span>
                  −{formatMoney(toNum(sale.discountAmount), settings.currency)}
                </span>
              </div>
            )}
            {toNum(sale.taxAmount) > 0 && (
              <div className="flex justify-between text-zinc-500">
                <span>Tax {settings.pricesIncludeTax ? "(incl.)" : ""}</span>
                <span>{formatMoney(toNum(sale.taxAmount), settings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
              <span>Total</span>
              <span>{formatMoney(toNum(sale.total), settings.currency)}</span>
            </div>
            {returned > 0 && (
              <>
                <div className="flex justify-between text-red-600">
                  <span>Returned</span>
                  <span>−{formatMoney(returned, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-zinc-900">
                  <span>Net total</span>
                  <span>{formatMoney(netTotal, settings.currency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-zinc-500">
              <span>Paid</span>
              <span>{formatMoney(toNum(sale.paidAmount), settings.currency)}</span>
            </div>
            {refunded > 0 && (
              <div className="flex justify-between text-zinc-500">
                <span>Paid back</span>
                <span>−{formatMoney(refunded, settings.currency)}</span>
              </div>
            )}
            {toNum(sale.changeAmount) > 0 && (
              <div className="flex justify-between text-zinc-500">
                <span>Change</span>
                <span>
                  {formatMoney(toNum(sale.changeAmount), settings.currency)}
                </span>
              </div>
            )}
            {balanceDue > 0 && (
              <>
                <div className="flex justify-between border-t border-dashed border-amber-300 pt-1.5 font-semibold text-amber-700">
                  <span>Balance due</span>
                  <span>{formatMoney(balanceDue, settings.currency)}</span>
                </div>
                {sale.dueDate && (
                  <p className="text-right text-xs text-amber-700">
                    payable by {formatDate(sale.dueDate)}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Printed with the receipt on purpose — this copy is what the customer
              walks away with when the bill goes on udhaar. */}
          {balanceDue > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-bold tracking-wide uppercase">Payment reminder</p>
              <p className="mt-1 leading-relaxed">
                {sale.customer?.name ?? "Customer"} owes{" "}
                <span className="font-semibold">
                  {formatMoney(balanceDue, settings.currency)}
                </span>{" "}
                against invoice {sale.invoiceNo}
                {sale.dueDate ? `, payable by ${formatDate(sale.dueDate)}` : ""}.
                Please settle this at the counter and keep a copy of this receipt.
              </p>
            </div>
          )}

          {hasReturns && (
            <div className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs">
              <p className="mb-2 font-semibold uppercase tracking-wide text-zinc-500">
                Returns
              </p>
              <ul className="space-y-2">
                {sale.returns.map((ret) => (
                  <li key={ret.id}>
                    <div className="flex justify-between text-zinc-900">
                      <span className="font-medium">
                        {ret.returnNo} · {formatDateTime(ret.createdAt)}
                      </span>
                      <span>−{formatMoney(toNum(ret.amount), settings.currency)}</span>
                    </div>
                    <p className="text-zinc-500">
                      {ret.items
                        .map(
                          (item) =>
                            `${formatQty(toNum(item.quantity))} × ${item.saleItem.productName}`
                        )
                        .join(", ")}
                    </p>
                    <p className="text-zinc-400">
                      {toNum(ret.refundAmount) > 0
                        ? `${formatMoney(toNum(ret.refundAmount), settings.currency)} paid back (${PAYMENT_LABELS[ret.refundMethod] ?? ret.refundMethod})`
                        : "Credited to account"}
                      {" · "}
                      {ret.user.name ?? "—"}
                      {ret.reason ? ` · ${ret.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sale.note && (
            <p className="mt-4 whitespace-pre-line border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
              Note: {sale.note}
            </p>
          )}

          {settings.receiptFooter && (
            <p className="mt-4 text-center text-xs text-zinc-500">
              {settings.receiptFooter}
            </p>
          )}
        </div>
      </div>

      {thermal && (
        <ThermalReceipt
          paper={thermal}
          store={{
            name: settings.storeName,
            address: settings.address,
            phone: settings.phone,
          }}
          title={sale.status === "HELD" ? "Held bill" : "Sale receipt"}
          meta={[
            { label: "Invoice", value: sale.invoiceNo },
            { label: "Date", value: formatDateTime(sale.createdAt) },
            { label: "Cashier", value: sale.user.name ?? "—" },
            { label: "Customer", value: sale.customer?.name ?? "Walk-in" },
            {
              label: "Payment",
              value: PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
            },
          ]}
          lines={sale.items.map((item) => ({
            name: item.productName,
            qty: formatQty(toNum(item.quantity)),
            price: formatMoney(toNum(item.unitPrice), currency),
            total: formatMoney(toNum(item.lineTotal), currency),
            discount:
              toNum(item.discount) > 0
                ? formatMoney(toNum(item.discount), currency)
                : undefined,
          }))}
          totals={[
            { label: "Subtotal", value: formatMoney(toNum(sale.subtotal), currency) },
            ...(toNum(sale.discountAmount) > 0
              ? [{ label: "Discount", value: `−${formatMoney(toNum(sale.discountAmount), currency)}` }]
              : []),
            ...(toNum(sale.taxAmount) > 0
              ? [{
                  label: `Tax${settings.pricesIncludeTax ? " (incl.)" : ""}`,
                  value: formatMoney(toNum(sale.taxAmount), currency),
                }]
              : []),
            { label: "TOTAL", value: formatMoney(toNum(sale.total), currency), strong: true },
            ...(returned > 0
              ? [
                  { label: "Returned", value: `−${formatMoney(returned, currency)}` },
                  { label: "Net total", value: formatMoney(netTotal, currency), strong: true },
                ]
              : []),
            { label: "Paid", value: formatMoney(toNum(sale.paidAmount), currency) },
            ...(refunded > 0
              ? [{ label: "Paid back", value: `−${formatMoney(refunded, currency)}` }]
              : []),
            ...(toNum(sale.changeAmount) > 0
              ? [{ label: "Change", value: formatMoney(toNum(sale.changeAmount), currency) }]
              : []),
            ...(balanceDue > 0
              ? [{ label: "BALANCE DUE", value: formatMoney(balanceDue, currency), strong: true }]
              : []),
          ]}
          notices={[
            ...(STATUS_NOTICE[sale.status] ? [STATUS_NOTICE[sale.status]] : []),
            ...sale.returns.map(
              (ret) =>
                `${ret.returnNo} · ${formatDate(ret.createdAt)}\n` +
                ret.items
                  .map((item) => `${formatQty(toNum(item.quantity))} × ${item.saleItem.productName}`)
                  .join("\n") +
                `\n−${formatMoney(toNum(ret.amount), currency)}`
            ),
            ...(balanceDue > 0
              ? [
                  `${sale.customer?.name ?? "Customer"} owes ${formatMoney(balanceDue, currency)}` +
                    (sale.dueDate ? `, payable by ${formatDate(sale.dueDate)}` : "") +
                    ". Please keep this receipt.",
                ]
              : []),
            ...(sale.note ? [`Note: ${sale.note}`] : []),
          ]}
          barcode={sale.invoiceNo}
          footer={settings.receiptFooter}
        />
      )}
    </div>
  );
}
