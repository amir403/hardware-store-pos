import Link from "next/link";
import { PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime, formatMoney, toNum } from "@/app/lib/format";
import { getCustomerBalances } from "@/app/lib/ledger";
import { PageHeader } from "@/app/components/page-header";
import { PartyForm } from "@/app/components/party-form";
import {
  createCustomerAction,
  updateCustomerAction,
  deleteCustomerAction,
} from "@/app/actions/parties";
import { ConfirmForm } from "@/app/components/confirm-form";
import { ListSearch } from "@/app/components/list-search";
import { getT } from "@/app/lib/i18n-server";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string }>;
}) {
  const [settings, params, t] = await Promise.all([getSettings(), searchParams, getT()]);

  const editId = params.edit;
  const q = params.q?.trim() ?? "";

  const [customers, editing] = await Promise.all([
    prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { name: "asc" },
      include: {
        _count: { select: { sales: true, payments: true } },
        sales: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { total: true, createdAt: true },
        },
      },
    }),
    editId
      ? prisma.customer.findUnique({ where: { id: editId } })
      : Promise.resolve(null),
  ]);

  // Derived from invoices + payments, never stored, so refunds and voids are
  // already reflected here.
  const balances = await getCustomerBalances(customers.map((c) => c.id));

  const totalReceivable = [...balances.values()].reduce(
    (sum, b) => sum + Math.max(0, b.outstanding),
    0
  );

  return (
    <>
      <PageHeader
        title={t("Customers")}
        description={`${customers.length} customer${customers.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""} · ${formatMoney(totalReceivable, settings.currency)}  ${t("Outstanding").toLowerCase()}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* List */}
        <div className="lg:col-span-2">
          <ListSearch
            action="/customers"
            defaultValue={q}
            placeholder={t("Search by name, phone or email…")}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">{t("Customer")}</th>
                  <th className="px-4 py-3 font-medium">{t("Phone")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("Sales")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("Balance")}</th>
                  <th className="px-4 py-3 font-medium">{t("Last purchase")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {customers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      No customers yet. Walk-in sales don&apos;t need one.
                    </td>
                  </tr>
                )}
                {customers.map((customer) => {
                  const balance = balances.get(customer.id);
                  const outstanding = balance?.outstanding ?? 0;
                  return (
                  <tr key={customer.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.notes && (
                        <p className="max-w-52 truncate text-xs text-zinc-400">
                          {customer.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {customer.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {customer._count.sales}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {outstanding > 0 && (
                        <p className="font-medium text-amber-700">
                          {formatMoney(outstanding, settings.currency)}
                        </p>
                      )}
                      {outstanding < 0 && (
                        <p className="font-medium text-emerald-700">
                          {formatMoney(-outstanding, settings.currency)} credit
                        </p>
                      )}
                      {outstanding === 0 && (
                        <span className="text-zinc-400">—</span>
                      )}
                      {customer.creditLimit !== null && outstanding > 0 && (
                        <p className="text-xs text-zinc-400">
                          limit {formatMoney(toNum(customer.creditLimit), settings.currency)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {customer.sales[0]
                        ? `${formatDateTime(customer.sales[0].createdAt)} · ${formatMoney(toNum(customer.sales[0].total), settings.currency)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/customers?edit=${customer.id}`}
                          title={t("Edit")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                        {customer._count.sales === 0 &&
                          customer._count.payments === 0 && (
                            <ConfirmForm
                              action={deleteCustomerAction}
                              successMessage={`${customer.name} deleted`}
                              message={`Delete customer ${customer.name}? This cannot be undone.`}
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={customer.id}
                              />
                              <button
                                type="submit"
                                title={t("Delete")}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </button>
                            </ConfirmForm>
                          )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              {editing ? t("Edit customer") : t("New customer")}
            </h2>
            {editing && (
              <Link
                href="/customers"
                title="Cancel edit"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <XIcon className="h-4 w-4" />
              </Link>
            )}
          </div>
          <PartyForm
            key={editing?.id ?? "new"}
            action={editing ? updateCustomerAction : createCustomerAction}
            submitLabel={editing ? t("Save changes") : t("Add customer")}
            successMessage={editing ? "Customer updated" : "Customer added"}
            showCreditLimit
            defaults={
              editing
                ? {
                    id: editing.id,
                    name: editing.name,
                    phone: editing.phone ?? "",
                    email: editing.email ?? "",
                    address: editing.address ?? "",
                    notes: editing.notes ?? "",
                    creditLimit:
                      editing.creditLimit === null
                        ? ""
                        : String(toNum(editing.creditLimit)),
                    priceTier: editing.priceTier,
                  }
                : {
                    name: "",
                    phone: "",
                    email: "",
                    address: "",
                    notes: "",
                    creditLimit: "",
                  }
            }
          />
        </div>
      </div>
    </>
  );
}
