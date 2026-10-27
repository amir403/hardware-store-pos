import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { formatDateTime } from "@/app/lib/format";
import { AUDIT_ACTIONS, type AuditAction } from "@/app/lib/audit";
import { PageHeader } from "@/app/components/page-header";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

/** Where an entry's subject lives, when it has a page of its own. */
function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "Sale":
      return `/sales/${entityId}`;
    case "Product":
      return `/products/${entityId}`;
    case "Customer":
      return `/customers/${entityId}`;
    case "Supplier":
      return `/suppliers/${entityId}`;
    case "Quotation":
      return `/quotations/${entityId}`;
    default:
      return null;
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  // The audit trail is how the owner checks everyone else, admins included.
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const params = await searchParams;
  const action =
    params.action && params.action in AUDIT_ACTIONS
      ? (params.action as AuditAction)
      : null;
  const page = Math.max(1, Number(params.page) || 1);

  const where = action ? { action } : {};
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (next: { action?: string | null; page?: number }) => {
    const q = new URLSearchParams();
    const a = next.action === undefined ? action : next.action;
    if (a) q.set("action", a);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/audit?${s}` : "/audit";
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${total} entr${total === 1 ? "y" : "ies"} · refunds, voids, returns, stock, prices, payments, users, shifts and expenses`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={link({ action: null })}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            !action
              ? "border-brand-700 bg-brand-700 text-white"
              : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          All
        </Link>
        {(Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((key) => (
          <Link
            key={key}
            href={link({ action: key })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              action === key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {AUDIT_ACTIONS[key]}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">What</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Nothing recorded yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const href = entityHref(entry.entityType, entry.entityId);
              return (
                <tr key={entry.id} className="align-top hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {entry.user?.name ?? entry.user?.email ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                    {AUDIT_ACTIONS[entry.action as AuditAction] ?? entry.action}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {entry.summary}
                      </Link>
                    ) : (
                      entry.summary
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={link({ page: page - 1 })}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
              >
                Newer
              </Link>
            )}
            {page < pages && (
              <Link
                href={link({ page: page + 1 })}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
              >
                Older
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
