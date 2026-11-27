import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, HandCoinsIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDate, formatMoney, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { PartyForm } from "@/app/components/party-form";
import { getSettings } from "@/app/lib/settings";
import { getSupplierBalances } from "@/app/lib/payables";
import {
  createSupplierAction,
  updateSupplierAction,
  deleteSupplierAction,
} from "@/app/actions/parties";
import { ConfirmForm } from "@/app/components/confirm-form";
import { ListSearch } from "@/app/components/list-search";
import { Drawer } from "@/app/components/drawer";

export const metadata = { title: "Suppliers" };

type Sort = "name" | "owed" | "recent";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string; show?: string; sort?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const editId = params.edit;
  const q = params.q?.trim() ?? "";
  const show = params.show === "owed" ? "owed" : "";
  const sort: Sort = params.sort === "owed" || params.sort === "recent" ? params.sort : "name";
  // Every link on the page keeps the current list view.
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, show, sort: sort === "name" ? "" : sort, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/suppliers?${query}` : "/suppliers";
  };
  const listHref = href({});

  const [settings, suppliers, editing] = await Promise.all([
    getSettings(),
    prisma.supplier.findMany({
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
        _count: { select: { purchases: true } },
        purchases: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { total: true, createdAt: true },
        },
      },
    }),
    editId
      ? prisma.supplier.findUnique({ where: { id: editId } })
      : Promise.resolve(null),
  ]);

  // Derived from purchases + supplier payments, never stored.
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));
  const all = suppliers.map((supplier) => ({
    supplier,
    owed: balances.get(supplier.id)?.outstanding ?? 0,
    last: supplier.purchases[0] ?? null,
  }));
  const owing = all.filter((row) => row.owed > 0);
  const totalPayable = owing.reduce((sum, row) => sum + row.owed, 0);
  const advance = all.filter((row) => row.owed < 0).reduce((sum, row) => sum - row.owed, 0);
  const list = (show ? owing : all).sort((a, b) =>
    sort === "owed"
      ? b.owed - a.owed
      : sort === "recent"
        ? (b.last?.createdAt.getTime() ?? 0) - (a.last?.createdAt.getTime() ?? 0)
        : a.supplier.name.localeCompare(b.supplier.name)
  );

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

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`}
        actions={
          <Link
            href={href({ new: "1" })}
            scroll={false}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            <PlusIcon className="h-4 w-4" /> New supplier
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Link href={href({ show: "owed", sort: "owed" })} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300">
          <p className="text-xs font-medium text-zinc-500">We owe</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${totalPayable > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {formatMoney(totalPayable, settings.currency)}
          </p>
          <p className="text-xs text-zinc-400">
            {owing.length} supplier{owing.length === 1 ? "" : "s"} to pay
          </p>
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-zinc-500">Advance paid</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">{formatMoney(advance, settings.currency)}</p>
          <p className="text-xs text-zinc-400">Paid ahead, to come back as goods</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-3">
        <div className="min-w-64 flex-1">
          <ListSearch
            action="/suppliers"
            defaultValue={q}
            placeholder="Search by name, phone or email…"
            keep={{ show, sort: sort === "name" ? undefined : sort }}
          />
        </div>
        <div className="mb-4 flex h-10 items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          {([["", "All"], ["owed", "We owe"]] as const).map(([key, label]) => (
            <Link
              key={key || "all"}
              href={href({ show: key })}
              className={`rounded-md px-3 py-1 text-sm transition ${
                show === key ? "bg-brand-700 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        {/* On a phone: name (phone under it) and what we owe; a tap opens the ledger with the rest. */}
        <table className="w-full text-left text-sm sm:min-w-[720px]">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              {sortHeader("name", "Supplier")}
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Phone</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Purchases</th>
              {sortHeader("recent", "Last purchase", "hidden sm:table-cell")}
              {sortHeader("owed", "We owe", "text-right")}
              <th className="hidden px-4 py-3 sm:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {suppliers.length === 0 ? "No suppliers yet." : show ? "Nothing owed right now." : "No suppliers match this search."}
                </td>
              </tr>
            )}
            {list.map(({ supplier, owed, last }) => (
              <tr key={supplier.id} className={`relative ${editing?.id === supplier.id ? "bg-brand-50/60" : "hover:bg-zinc-50"}`}>
                <td className="px-4 py-3">
                  {/* Stretched over the row: a click anywhere opens the ledger. */}
                  <Link
                    href={`/suppliers/${supplier.id}`}
                    className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                  >
                    {supplier.name}
                  </Link>
                  {supplier.phone && <p className="text-xs text-zinc-500 sm:hidden">{supplier.phone}</p>}
                  {supplier.notes && <p className="max-w-40 truncate text-xs text-zinc-400 sm:max-w-72">{supplier.notes}</p>}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-zinc-600 sm:table-cell">{supplier.phone ?? "—"}</td>
                <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-600 sm:table-cell">{supplier._count.purchases}</td>
                <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">
                  {last ? (
                    <>
                      <span className="text-zinc-700">{formatDate(last.createdAt)}</span>
                      <span className="block text-xs text-zinc-400">{formatMoney(toNum(last.total), settings.currency)}</span>
                    </>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {owed > 0 ? (
                    <span className="font-semibold tabular-nums text-amber-700">{formatMoney(owed, settings.currency)}</span>
                  ) : owed < 0 ? (
                    <span className="font-medium tabular-nums text-emerald-700">{formatMoney(-owed, settings.currency)} advance</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  {/* z-10 keeps these above the stretched row link. */}
                  <div className="relative z-10 flex items-center justify-end gap-1">
                    {owed > 0 && (
                      <Link
                        href={`/suppliers/${supplier.id}#pay-supplier`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
                      >
                        <HandCoinsIcon className="h-3.5 w-3.5" /> Pay
                      </Link>
                    )}
                    <Link
                      href={href({ edit: supplier.id })}
                      scroll={false}
                      title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    {supplier._count.purchases === 0 && (
                      <ConfirmForm
                        action={deleteSupplierAction}
                        successMessage={`${supplier.name} deleted`}
                        message={`Delete supplier ${supplier.name}? This cannot be undone.`}
                      >
                        <input type="hidden" name="id" value={supplier.id} />
                        <button
                          type="submit"
                          title="Delete"
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

      {(editing || params.new) && (
        <Drawer title={editing ? `Edit supplier: ${editing.name}` : "New supplier"} closeHref={listHref}>
          <PartyForm
            key={editing?.id ?? "new"}
            action={editing ? updateSupplierAction : createSupplierAction}
            submitLabel={editing ? "Save changes" : "Add supplier"}
            successMessage={editing ? "Supplier updated" : "Supplier added"}
            doneHref={listHref}
            defaults={
              editing
                ? {
                    id: editing.id,
                    name: editing.name,
                    phone: editing.phone ?? "",
                    email: editing.email ?? "",
                    address: editing.address ?? "",
                    notes: editing.notes ?? "",
                  }
                : { name: "", phone: "", email: "", address: "", notes: "" }
            }
          />
        </Drawer>
      )}
    </>
  );
}
