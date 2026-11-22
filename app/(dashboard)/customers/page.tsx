import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, HandCoinsIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatMoney, toNum } from "@/app/lib/format";
import { getCustomerBalances } from "@/app/lib/ledger";
import { duesReminderText } from "@/app/lib/whatsapp";
import { PageHeader } from "@/app/components/page-header";
import { PartyForm } from "@/app/components/party-form";
import { Drawer } from "@/app/components/drawer";
import { WhatsAppButton } from "@/app/components/whatsapp-button";
import {
  createCustomerAction,
  updateCustomerAction,
  deleteCustomerAction,
} from "@/app/actions/parties";
import { ConfirmForm } from "@/app/components/confirm-form";
import { ListSearch } from "@/app/components/list-search";
import { getT } from "@/app/lib/i18n-server";

export const metadata = { title: "Customers" };

const SHOWS = { "": "All", owing: "Owe money", over: "Over credit limit" } as const;
type Show = keyof typeof SHOWS;
type Sort = "name" | "balance" | "recent";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string; show?: string; sort?: string }>;
}) {
  const [settings, params, t] = await Promise.all([getSettings(), searchParams, getT()]);

  const q = params.q?.trim() ?? "";
  const show: Show = params.show === "owing" || params.show === "over" ? params.show : "";
  const sort: Sort = params.sort === "balance" || params.sort === "recent" ? params.sort : "name";

  // Every link on the page keeps the current list view.
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, show, sort: sort === "name" ? "" : sort, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/customers?${query}` : "/customers";
  };
  const listHref = href({});

  const [rows, editing] = await Promise.all([
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
    params.edit ? prisma.customer.findUnique({ where: { id: params.edit } }) : Promise.resolve(null),
  ]);

  // Derived from invoices + payments, never stored, so refunds and voids are
  // already reflected here.
  const balances = await getCustomerBalances(rows.map((c) => c.id));
  const all = rows.map((customer) => {
    const outstanding = balances.get(customer.id)?.outstanding ?? 0;
    const limit = customer.creditLimit === null ? null : toNum(customer.creditLimit);
    return {
      customer,
      outstanding,
      limit,
      overLimit: limit !== null && outstanding > 0 && outstanding >= limit,
      lastSale: customer.sales[0] ?? null,
    };
  });

  const owing = all.filter((row) => row.outstanding > 0);
  const totalReceivable = owing.reduce((sum, row) => sum + row.outstanding, 0);
  const overLimit = all.filter((row) => row.overLimit);
  const advance = all.filter((row) => row.outstanding < 0).reduce((sum, row) => sum - row.outstanding, 0);

  const list = (show === "owing" ? owing : show === "over" ? overLimit : all).sort((a, b) =>
    sort === "balance"
      ? b.outstanding - a.outstanding
      : sort === "recent"
        ? (b.lastSale?.createdAt.getTime() ?? 0) - (a.lastSale?.createdAt.getTime() ?? 0)
        : a.customer.name.localeCompare(b.customer.name)
  );

  const stats = [
    { label: t("Outstanding"), value: formatMoney(totalReceivable, settings.currency), tone: totalReceivable > 0 ? "text-amber-700" : "text-zinc-900", sub: `${owing.length} customer${owing.length === 1 ? "" : "s"} owe money`, link: href({ show: "owing", sort: "balance" }) },
    { label: "Over credit limit", value: String(overLimit.length), tone: overLimit.length > 0 ? "text-red-700" : "text-zinc-900", sub: overLimit.length > 0 ? "Collect before selling more on credit" : "Everyone is within their limit", link: href({ show: "over", sort: "balance" }) },
    { label: "Advance held", value: formatMoney(advance, settings.currency), tone: "text-emerald-700", sub: "Paid ahead, owed back as goods", link: null },
  ];

  const sortHeader = (key: Sort, label: string, align = "") => (
    <th className={`px-4 py-3 font-medium ${align}`}>
      <Link
        href={href({ sort: key === "name" ? "" : key })}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${sort === key ? "text-zinc-900" : ""}`}
      >
        {label}
        {sort === key && (key === "name" ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />)}
      </Link>
    </th>
  );

  const drawerOpen = editing || params.new;

  return (
    <>
      <PageHeader
        title={t("Customers")}
        description={`${rows.length} customer${rows.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`}
        actions={
          <Link
            href={href({ new: "1" })}
            scroll={false}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" /> {t("New customer")}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const body = (
            <>
              <p className="text-xs font-medium text-zinc-500">{stat.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
              <p className="text-xs text-zinc-400">{stat.sub}</p>
            </>
          );
          return stat.link ? (
            <Link key={stat.label} href={stat.link} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300">
              {body}
            </Link>
          ) : (
            <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              {body}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-x-3">
        <div className="min-w-64 flex-1">
          <ListSearch
            action="/customers"
            defaultValue={q}
            placeholder={t("Search by name, phone or email…")}
            keep={{ show, sort: sort === "name" ? undefined : sort }}
          />
        </div>
        <div className="mb-4 flex h-10 items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          {(Object.keys(SHOWS) as Show[]).map((key) => (
            <Link
              key={key || "all"}
              href={href({ show: key })}
              className={`rounded-md px-3 py-1 text-sm transition ${
                show === key ? "bg-brand-700 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {SHOWS[key]}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              {sortHeader("name", t("Customer"))}
              <th className="px-4 py-3 font-medium">{t("Phone")}</th>
              <th className="px-4 py-3 text-right font-medium">Bills</th>
              {sortHeader("recent", t("Last purchase"))}
              {sortHeader("balance", t("Balance"), "text-right")}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {rows.length === 0
                    ? "No customers yet. Walk-in sales don't need one."
                    : show
                      ? "Nobody here right now."
                      : "No customers match this search."}
                </td>
              </tr>
            )}
            {list.map(({ customer, outstanding, limit, overLimit: isOver, lastSale }) => (
              <tr key={customer.id} className={`relative ${editing?.id === customer.id ? "bg-brand-50/60" : "hover:bg-zinc-50"}`}>
                <td className="px-4 py-3">
                  {/* Stretched over the row: a click anywhere opens the ledger. */}
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                  >
                    {customer.name}
                  </Link>
                  {customer.priceTier === "WHOLESALE" && (
                    <span className="ml-2 rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                      Wholesale
                    </span>
                  )}
                  {customer.notes && <p className="max-w-72 truncate text-xs text-zinc-400">{customer.notes}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{customer.phone ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{customer._count.sales}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lastSale ? (
                    <>
                      <span className="text-zinc-700">{formatDate(lastSale.createdAt)}</span>
                      <span className="block text-xs text-zinc-400">
                        {formatMoney(toNum(lastSale.total), settings.currency)}
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {outstanding > 0 ? (
                    <span className={`font-semibold tabular-nums ${isOver ? "text-red-700" : "text-amber-700"}`}>
                      {formatMoney(outstanding, settings.currency)}
                    </span>
                  ) : outstanding < 0 ? (
                    <span className="font-medium tabular-nums text-emerald-700">
                      {formatMoney(-outstanding, settings.currency)} advance
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                  {limit !== null && (
                    <span className={`block text-xs ${isOver ? "font-medium text-red-700" : "text-zinc-400"}`}>
                      {isOver ? "over " : "limit "}
                      {formatMoney(limit, settings.currency)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* z-10 keeps these above the stretched row link. */}
                  <div className="relative z-10 flex items-center justify-end gap-1">
                    {outstanding > 0 && (
                      <>
                        <Link
                          href={`/customers/${customer.id}#receive-payment`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
                        >
                          <HandCoinsIcon className="h-3.5 w-3.5" /> {t("Receive payment")}
                        </Link>
                        {customer.phone && (
                          <WhatsAppButton
                            compact
                            phone={customer.phone}
                            label="Remind"
                            text={duesReminderText({
                              storeName: settings.storeName,
                              customerName: customer.name,
                              amount: formatMoney(outstanding, settings.currency),
                            })}
                          />
                        )}
                      </>
                    )}
                    <Link
                      href={href({ edit: customer.id })}
                      scroll={false}
                      title={t("Edit")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    {customer._count.sales === 0 && customer._count.payments === 0 && (
                      <ConfirmForm
                        action={deleteCustomerAction}
                        successMessage={`${customer.name} deleted`}
                        message={`Delete customer ${customer.name}? This cannot be undone.`}
                      >
                        <input type="hidden" name="id" value={customer.id} />
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
            ))}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <Drawer title={editing ? `${t("Edit customer")}: ${editing.name}` : t("New customer")} closeHref={listHref}>
          <PartyForm
            key={editing?.id ?? "new"}
            action={editing ? updateCustomerAction : createCustomerAction}
            submitLabel={editing ? t("Save changes") : t("Add customer")}
            successMessage={editing ? "Customer updated" : "Customer added"}
            doneHref={listHref}
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
                    creditLimit: editing.creditLimit === null ? "" : String(toNum(editing.creditLimit)),
                    priceTier: editing.priceTier,
                  }
                : { name: "", phone: "", email: "", address: "", notes: "", creditLimit: "" }
            }
          />
        </Drawer>
      )}
    </>
  );
}
