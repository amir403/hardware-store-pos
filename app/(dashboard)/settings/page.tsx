import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { PageHeader } from "@/app/components/page-header";
import { SettingsForm } from "@/app/components/settings-form";
import { updateSettingsAction } from "@/app/actions/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Store details used across the app — receipts, POS totals and product defaults."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <SettingsForm
              action={updateSettingsAction}
              defaults={{
                storeName: settings.storeName,
                address: settings.address ?? "",
                phone: settings.phone ?? "",
                currency: settings.currency,
                taxRate: String(settings.taxRate),
                pricesIncludeTax: settings.pricesIncludeTax,
                receiptFooter: settings.receiptFooter ?? "",
                receiptPaper: settings.receiptPaper,
                labelSize: settings.labelSize,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              About taxes
            </h2>
            <p className="mb-2">
              Each product can carry its own tax rate. The rate set here only
              pre-fills new products.
            </p>
            <p>
              The{" "}
              <span className="font-medium text-zinc-900">
                prices include tax
              </span>{" "}
              switch decides whether the tax amount is treated as part of the
              listed price or added on top at checkout.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              Users
            </h2>
            <p>
              Cashiers can sell and manage customers. Managers additionally
              handle products, purchases, suppliers and inventory. Admins can
              do everything, including these settings.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
