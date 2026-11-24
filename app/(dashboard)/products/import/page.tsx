import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { PageHeader } from "@/app/components/page-header";
import { ProductImport } from "@/app/components/product-import";

export const metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) redirect("/products");
  const settings = await getSettings();

  return (
    <div>
      <Link href="/products" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeftIcon className="h-4 w-4" /> Back to products
      </Link>
      <PageHeader
        title="Import products"
        description="Bring a whole price list in from Excel at once. Nothing is saved until you press Import."
      />
      <ProductImport currency={settings.currency} />
    </div>
  );
}
