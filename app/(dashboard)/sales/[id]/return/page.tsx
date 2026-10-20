import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { round2, round3, toNum } from "@/app/lib/format";
import { invoiceSettlement } from "@/app/lib/ledger";
import { PageHeader } from "@/app/components/page-header";
import { ReturnForm, type ReturnableItem } from "@/app/components/sales/return-form";

export const metadata = { title: "Return items" };

export default async function ReturnItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  // Taking goods back reverses revenue, so it stays with the managers.
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const { id } = await params;

  const [sale, settings] = await Promise.all([
    prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { productName: "asc" },
          include: {
            returnItems: { select: { quantity: true, amount: true } },
          },
        },
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        returns: { select: { amount: true, refundAmount: true } },
      },
    }),
    getSettings(),
  ]);

  if (!sale) notFound();
  if (sale.status !== "COMPLETED") redirect(`/sales/${sale.id}`);

  const subtotal = toNum(sale.subtotal);
  const factor = subtotal > 0 ? toNum(sale.total) / subtotal : 0;

  const items: ReturnableItem[] = sale.items.map((item) => {
    const sold = toNum(item.quantity);
    const returnedQty = item.returnItems.reduce(
      (sum, r) => sum + toNum(r.quantity),
      0
    );
    return {
      id: item.id,
      name: item.productName,
      sold,
      remaining: round3(sold - returnedQty),
      lineValue: round2(toNum(item.lineTotal) * factor),
      credited: round2(
        item.returnItems.reduce((sum, r) => sum + toNum(r.amount), 0)
      ),
    };
  });

  const { netTotal, settled } = invoiceSettlement(sale);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={`/sales/${sale.id}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to {sale.invoiceNo}
        </Link>
      </div>

      <PageHeader
        title="Return items"
        description={`${sale.invoiceNo} · ${sale.customer?.name ?? "Walk-in"} · items go back into stock`}
      />

      <ReturnForm
        saleId={sale.id}
        invoiceNo={sale.invoiceNo}
        items={items}
        customerName={sale.customer?.name ?? null}
        netTotal={netTotal}
        settled={settled}
        currency={settings.currency}
      />
    </div>
  );
}
