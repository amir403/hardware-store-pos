import { redirect } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { PageHeader } from "@/app/components/page-header";
import { CategoryForm } from "@/app/components/category-form";
import { SubmitButton } from "@/app/components/submit-button";
import {
  createCategoryAction,
  renameCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/");
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize your catalog"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Category list */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Products</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {categories.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      No categories yet.
                    </td>
                  </tr>
                )}
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5">
                      <form
                        action={renameCategoryAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={category.id} />
                        <input
                          name="name"
                          defaultValue={category.name}
                          maxLength={50}
                          required
                          className="h-8 w-48 rounded-lg border border-transparent bg-transparent px-2 text-sm font-medium text-zinc-900 outline-none hover:border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                        />
                        <SubmitButton
                          pendingLabel="…"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
                        >
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {category._count.products}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {category._count.products === 0 ? (
                        <form action={deleteCategoryAction}>
                          <input
                            type="hidden"
                            name="id"
                            value={category.id}
                          />
                          <button
                            type="submit"
                            title="Delete empty category"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </form>
                      ) : (
                        <span
                          className="text-xs text-zinc-300"
                          title="Categories with products cannot be deleted"
                        >
                          in use
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create form */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">
            New category
          </h2>
          <CategoryForm action={createCategoryAction} />
        </div>
      </div>
    </>
  );
}
