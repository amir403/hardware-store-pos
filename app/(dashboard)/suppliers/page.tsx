import Link from "next/link";
import { redirect } from "next/navigation";
import { PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDateTime, formatMoney, toNum } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { PartyForm } from "@/app/components/party-form";
import {
  createSupplierAction,
  updateSupplierAction,
  deleteSupplierAction,
} from "@/app/actions/parties";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const editId = params.edit;

  const [suppliers, editing] = await Promise.all([
    prisma.supplier.findMany({
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

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* List */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 text-right font-medium">Purchases</th>
                  <th className="px-4 py-3 font-medium">Last purchase</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {suppliers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      No suppliers yet.
                    </td>
                  </tr>
                )}
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {supplier.name}
                      </p>
                      {supplier.notes && (
                        <p className="max-w-52 truncate text-xs text-zinc-400">
                          {supplier.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {supplier.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {supplier._count.purchases}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {supplier.purchases[0]
                        ? `${formatDateTime(supplier.purchases[0].createdAt)} · ${formatMoney(toNum(supplier.purchases[0].total), "PKR")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/suppliers?edit=${supplier.id}`}
                          title="Edit"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                        {supplier._count.purchases === 0 && (
                          <form action={deleteSupplierAction}>
                            <input
                              type="hidden"
                              name="id"
                              value={supplier.id}
                            />
                            <button
                              type="submit"
                              title="Delete"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              {editing ? "Edit supplier" : "New supplier"}
            </h2>
            {editing && (
              <Link
                href="/suppliers"
                title="Cancel edit"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <XIcon className="h-4 w-4" />
              </Link>
            )}
          </div>
          <PartyForm
            key={editing?.id ?? "new"}
            action={editing ? updateSupplierAction : createSupplierAction}
            submitLabel={editing ? "Save changes" : "Add supplier"}
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
                : {
                    name: "",
                    phone: "",
                    email: "",
                    address: "",
                    notes: "",
                  }
            }
          />
        </div>
      </div>
    </>
  );
}
