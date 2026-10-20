import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { PageHeader } from "@/app/components/page-header";
import { ProductForm } from "@/app/components/product-form";
import { createProductAction } from "@/app/actions/products";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    redirect("/products");
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to products
      </Link>

      <PageHeader title="New product" description="Add an item to the catalog" />

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <ProductForm
          action={createProductAction}
          categories={categories}
          isEdit={false}
          defaults={{
            name: "",
            sku: "",
            barcode: "",
            description: "",
            unit: "pcs",
            categoryId: "",
            costPrice: "0",
            price: "",
            taxRate: "0",
            stockQty: "0",
            reorderLevel: "0",
            trackStock: true,
          }}
        />
      </div>
    </div>
  );
}
