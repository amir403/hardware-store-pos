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

      <div className="max-w-4xl">
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
            cashierMaxDiscountPct: String(settings.cashierMaxDiscountPct),
          }}
        />
      </div>
    </>
  );
}
