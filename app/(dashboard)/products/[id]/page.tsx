import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { PageHeader } from "@/app/components/page-header";
import { ProductForm } from "@/app/components/product-form";
import { updateProductAction } from "@/app/actions/products";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!hasRole(user, "ADMIN", "MANAGER")) notFound();

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to products
      </Link>

      <PageHeader
        title="Edit product"
        description={product.name}
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <ProductForm
          action={updateProductAction}
          categories={categories}
          isEdit={true}
          defaults={{
            id: product.id,
            name: product.name,
            sku: product.sku ?? "",
            barcode: product.barcode ?? "",
            description: product.description ?? "",
            unit: product.unit,
            categoryId: product.categoryId ?? "",
            costPrice: String(product.costPrice ?? 0),
            price: String(product.price ?? 0),
            wholesalePrice:
              product.wholesalePrice === null ? "" : String(product.wholesalePrice),
            taxRate: String(product.taxRate ?? 0),
            stockQty: String(product.stockQty ?? 0),
            reorderLevel: String(product.reorderLevel ?? 0),
            trackStock: product.trackStock,
          }}
        />
      </div>
    </div>
  );
}
