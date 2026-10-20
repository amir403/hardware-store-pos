import Link from "next/link";
import { redirect } from "next/navigation";
import { PencilIcon, XIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDate } from "@/app/lib/format";
import { PageHeader } from "@/app/components/page-header";
import { UserForm } from "@/app/components/user-form";
import { createUserAction, updateUserAction } from "@/app/actions/users";

export const metadata = { title: "Users" };

const roleBadge: Record<string, string> = {
  ADMIN:
    "inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700",
  MANAGER:
    "inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700",
  CASHIER:
    "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const editId = params.edit;

  const [users, editing] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { sales: true } },
      },
    }),
    editId
      ? prisma.user.findUnique({
          where: { id: editId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description={`${users.length} user${users.length === 1 ? "" : "s"} with access to this store`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* List */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 text-right font-medium">Sales</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {u.name ?? u.email.split("@")[0]}
                        {u.id === user.id && (
                          <span className="ml-1.5 text-xs font-normal text-zinc-400">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={roleBadge[u.role] ?? roleBadge.CASHIER}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {u._count.sales}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.isActive ? (
                        <span className="text-emerald-600">Active</span>
                      ) : (
                        <span className="text-zinc-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <Link
                          href={`/users?edit=${u.id}`}
                          title="Edit"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
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
              {editing ? "Edit user" : "New user"}
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
