import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { CheckIcon, MinusIcon, PencilIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDate, formatDateTime, formatMoney, toNum } from "@/app/lib/format";
import { ROLE_INFO, ROLE_ORDER, SEED_PASSWORDS, rolePermissions } from "@/app/lib/roles";
import { PageHeader } from "@/app/components/page-header";
import { UserForm } from "@/app/components/user-form";
import { createUserAction, updateUserAction } from "@/app/actions/users";

export const metadata = { title: "Users" };

const roleBadge: Record<string, string> = {
  ADMIN: "inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700",
  MANAGER: "inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700",
  CASHIER: "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600",
};

/** "Today, 3:10 PM" / "Yesterday, …" read faster than a full date for recent sign-ins. */
function lastSeen(date: Date | null): string {
  if (!date) return "Never";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(date)) / 86_400_000);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return formatDateTime(date);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const [user, params, settings] = await Promise.all([getCurrentUser(), searchParams, getSettings()]);
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const editId = params.edit;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [users, monthSales] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        hashedPassword: true,
      },
    }),
    prisma.sale.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  // Hashes never leave the server; only "still on a demo password" does.
  const onSeedPassword = new Set(
    (
      await Promise.all(
        users.map(async (u) => {
          if (!u.hashedPassword) return null;
          const hits = await Promise.all(SEED_PASSWORDS.map((p) => bcrypt.compare(p, u.hashedPassword!)));
          return hits.some(Boolean) ? u.id : null;
        })
      )
    ).filter((id): id is string => id !== null)
  );
  const salesBy = new Map(monthSales.map((row) => [row.userId, row]));
  const editing = editId ? users.find((u) => u.id === editId) ?? null : null;
  const weakActive = users.filter((u) => u.isActive && onSeedPassword.has(u.id));
  const permissions = rolePermissions(toNum(settings.cashierMaxDiscountPct));

  return (
    <>
      <PageHeader
        title="Users"
        description={`${users.length} user${users.length === 1 ? "" : "s"} with access to this store`}
      />

      {weakActive.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-medium">
              {weakActive.length} account{weakActive.length === 1 ? " still uses" : "s still use"} a demo password
            </span>{" "}
            that anyone could guess: {weakActive.map((u) => u.name ?? u.email).join(", ")}. Open each one and set a new
            password (the Generate button makes a strong one).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 text-right font-medium">Sales this month</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((u) => {
                  const sales = salesBy.get(u.id);
                  const isEditing = editing?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      // The name link stretches over the row, so a click anywhere opens the editor.
                      className={`relative ${isEditing ? "bg-brand-50/60" : "hover:bg-zinc-50"} ${
                        u.isActive ? "" : "text-zinc-400"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/users?edit=${u.id}`}
                          className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                        >
                          <span className={u.isActive ? "" : "text-zinc-500"}>{u.name ?? u.email.split("@")[0]}</span>
                          {u.id === user.id && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}
                        </Link>
                        <p className="text-xs text-zinc-400">{u.email}</p>
                        {onSeedPassword.has(u.id) && (
                          <p className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            <TriangleAlertIcon className="h-3 w-3" /> Demo password
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={roleBadge[u.role] ?? roleBadge.CASHIER}>{ROLE_INFO[u.role].label}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {sales ? (
                          <>
                            <span className={u.isActive ? "font-medium text-zinc-900" : ""}>
                              {formatMoney(toNum(sales._sum.total), settings.currency)}
                            </span>
                            <span className="block text-xs text-zinc-400">
                              {sales._count} bill{sales._count === 1 ? "" : "s"}
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={u.lastLoginAt ? (u.isActive ? "text-zinc-700" : "") : "text-zinc-400"}>
                          {lastSeen(u.lastLoginAt)}
                        </span>
                        <span className="block text-xs text-zinc-400">joined {formatDate(u.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PencilIcon className="ml-auto h-4 w-4 text-zinc-400" aria-hidden />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* What each role may do, so the role picked in the form is an informed choice. */}
          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">What each role can do</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Change someone&apos;s role by opening them in the list. The cashier discount cap is set in Settings.
              </p>
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-zinc-500" />
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="w-28 px-3 py-2.5 text-center">
                      <span className={roleBadge[role]}>{ROLE_INFO[role].label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {permissions.map((p) => (
                  <tr key={p.label}>
                    <td className="px-4 py-2 text-zinc-700">{p.label}</td>
                    {[p.admin, p.manager, p.cashier].map((value, i) => (
                      <td key={i} className="px-3 py-2 text-center">
                        {value === true ? (
                          <CheckIcon className="mx-auto h-4 w-4 text-emerald-600" aria-label="Yes" />
                        ) : value === false ? (
                          <MinusIcon className="mx-auto h-4 w-4 text-zinc-300" aria-label="No" />
                        ) : (
                          <span className="text-xs font-medium text-amber-700">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 lg:sticky lg:top-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              {editing ? `Edit ${editing.name ?? editing.email}` : "New user"}
            </h2>
            {editing && (
              <Link
                href="/users"
                title="Cancel edit"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <XIcon className="h-4 w-4" />
              </Link>
            )}
          </div>
          <UserForm
            key={editing?.id ?? "new"}
            action={editing ? updateUserAction : createUserAction}
            submitLabel={editing ? "Save changes" : "Add user"}
            defaults={
              editing
                ? {
                    id: editing.id,
                    name: editing.name ?? "",
                    email: editing.email,
                    role: editing.role,
                    isActive: editing.isActive,
                  }
                : { name: "", email: "", role: "CASHIER" }
            }
          />
        </div>
      </div>
    </>
  );
}
