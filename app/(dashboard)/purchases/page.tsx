import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon, ArrowRightIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatMoney, formatDateTime, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { purchaseSettlement } from "@/app/lib/payables";
import { ListSearch } from "@/app/components/list-search";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const q = params.q?.trim() ?? "";

  const purchases = await prisma.purchase.findMany({
    where: q
      ? {
          OR: [
            { referenceNo: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
            {
              items: {
                some: { product: { name: { contains: q, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { items: true } },
      payments: { select: { amount: true } },
      returns: { select: { amount: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Purchases"
        description={
          q
            ? `${purchases.length} purchase${purchases.length === 1 ? "" : "s"} matching "${q}"`
            : "Stock intake from suppliers"
        }
        actions={
          <Link
            href="/purchases/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            <PlusIcon className="h-4 w-4" />
            Record purchase
          </Link>
        }
      />

      <ListSearch
        action="/purchases"
        defaultValue={q}
        placeholder="Search by reference, supplier or product…"
      />

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Received by</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Unpaid</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {purchases.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-zinc-400"
                >
                  No purchases recorded yet.
                </td>
              </tr>
            )}
            {purchases.map((purchase) => {
              const { due } = purchaseSettlement(purchase);
              return (
                <tr key={purchase.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-600">
                    {formatDateTime(purchase.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {purchase.referenceNo ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {purchase.supplier?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {purchase.user?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600">
                    {purchase._count.items}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                    {formatMoney(toNum(purchase.total), settings.currency)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      due > 0 ? "font-medium text-amber-700" : "text-zinc-400"
                    }`}
                  >
                    {due > 0 ? formatMoney(due, settings.currency) : "Paid"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                      title="View purchase"
                    >
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
