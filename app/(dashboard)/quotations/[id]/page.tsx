import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, formatQty, toNum } from "@/app/lib/format";
import { cancelQuotationAction } from "@/app/actions/quotations";
import { PrintButton } from "@/app/components/print-button";
import { ConvertQuotationButton } from "@/app/components/quotations/convert-button";
import { ConfirmForm } from "@/app/components/confirm-form";
import { FlashToast } from "@/app/components/toast";

export const metadata = { title: "Quotation" };

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const [quote, settings] = await Promise.all([
    prisma.quotation.findUnique({
      where: { id },
      include: {
        items: { orderBy: { productName: "asc" } },
        customer: { select: { name: true, phone: true } },
        user: { select: { name: true } },
        sale: { select: { id: true, invoiceNo: true, status: true } },
      },
    }),
    getSettings(),
  ]);
  if (!quote) notFound();

  const currency = settings.currency;
  const expired =
    quote.status === "OPEN" && quote.validUntil !== null && quote.validUntil < new Date();
  const isOpen = quote.status === "OPEN";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-2 print:hidden">
        <Link
          href="/quotations"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to quotations
        </Link>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <PrintButton />
          {isOpen && (
            <ConfirmForm
              action={cancelQuotationAction}
              successMessage={`${quote.quoteNo} cancelled`}
              message={`Cancel ${quote.quoteNo}? It can no longer be converted to a sale.`}
            >
              <input type="hidden" name="id" value={quote.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                <XIcon className="h-4 w-4" /> Cancel
              </button>
            </ConfirmForm>
          )}
          {isOpen && <ConvertQuotationButton quotationId={quote.id} />}
        </div>
      </div>

      {sp.new === "1" && (
        <FlashToast
          message={`${quote.quoteNo} saved — print it or share it with the customer`}
          clearParams={["new"]}
        />
      )}
      {expired && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          This quotation passed its valid-until date. It can still be converted,
          but check that the prices still hold.
        </div>
      )}
      {quote.status === "CONVERTED" && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
          Converted{" "}
          {quote.sale ? (
            <>
              to{" "}
              <Link href={`/sales/${quote.sale.id}`} className="font-medium underline">
                {quote.sale.invoiceNo}
              </Link>
              {quote.sale.status === "HELD" && (
                <>
                  {" "}— still a held bill.{" "}
                  <Link href={`/pos?recall=${quote.sale.id}`} className="font-medium underline">
                    Open it at the POS
                  </Link>
                </>
              )}
            </>
          ) : (
            "to a sale"
          )}
          .
        </div>
      )}
      {quote.status === "CANCELLED" && (
        <div className="mb-4 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-600 print:hidden">
          This quotation was cancelled.
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-8 print:border-0 print:shadow-none">
        <div className="border-b border-dashed border-zinc-200 pb-4 text-center">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">
            {settings.storeName}
          </h1>
          {settings.address && <p className="text-xs text-zinc-500">{settings.address}</p>}
          {settings.phone && <p className="text-xs text-zinc-500">Tel: {settings.phone}</p>}
          <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-zinc-700">
            Quotation
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-zinc-200 py-4 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Quotation</span>
            <span className="font-semibold text-zinc-900">{quote.quoteNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Date</span>
            <span className="text-zinc-900">{formatDateTime(quote.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">For</span>
            <span className="text-zinc-900">
              {quote.customer?.name ?? quote.customerName ?? "Walk-in"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Valid until</span>
            <span className="text-zinc-900">
              {quote.validUntil ? formatDate(quote.validUntil) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Prepared by</span>
            <span className="text-zinc-900">{quote.user.name ?? "—"}</span>
          </div>
          {quote.customer?.phone && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone</span>
              <span className="text-zinc-900">{quote.customer.phone}</span>
            </div>
          )}
        </div>

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
            {quote.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100">
                <td className="py-2 pr-2 text-zinc-900">
                  {item.productName}
                  {toNum(item.discount) > 0 && (
                    <span className="block text-[11px] text-zinc-400">
                      discount {formatMoney(toNum(item.discount), currency)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-zinc-600">{formatQty(toNum(item.quantity))}</td>
                <td className="py-2 text-right text-zinc-600">
                  {formatMoney(toNum(item.unitPrice), currency)}
                </td>
                <td className="py-2 text-right font-medium text-zinc-900">
                  {formatMoney(toNum(item.lineTotal), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal</span>
            <span>{formatMoney(toNum(quote.subtotal), currency)}</span>
          </div>
          {toNum(quote.discountAmount) > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>Discount</span>
              <span>−{formatMoney(toNum(quote.discountAmount), currency)}</span>
            </div>
          )}
          {toNum(quote.taxAmount) > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>Tax {settings.pricesIncludeTax ? "(incl.)" : ""}</span>
              <span>{formatMoney(toNum(quote.taxAmount), currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
            <span>Total</span>
            <span>{formatMoney(toNum(quote.total), currency)}</span>
          </div>
        </div>

        {quote.note && (
          <p className="mt-4 whitespace-pre-line border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
            Note: {quote.note}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-zinc-500">
          This is an estimate, not a bill. Prices are held until{" "}
          {quote.validUntil ? formatDate(quote.validUntil) : "further notice"} and
          stock is subject to availability.
        </p>
      </div>
    </div>
  );
}
