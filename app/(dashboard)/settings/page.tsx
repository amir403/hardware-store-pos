import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime } from "@/app/lib/format";
import { readBackupStatus, backupProblem } from "@/app/lib/backup";
import { PageHeader } from "@/app/components/page-header";
import { SettingsForm } from "@/app/components/settings-form";
import { BackupNowButton } from "@/app/components/backup-now-button";
import { updateSettingsAction } from "@/app/actions/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const [settings, backup] = await Promise.all([getSettings(), readBackupStatus()]);
  const problem = backupProblem(backup, new Date());

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

        <section id="backups" className="mt-6 grid scroll-mt-4 gap-4 rounded-xl border border-zinc-200 bg-white p-5 md:grid-cols-3 md:gap-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Backups</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Every night at closing the whole database is saved. Keep a second copy away from this computer: a
              dead hard disk or a theft should never cost the shop its accounts.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm md:col-span-2">
            {!backup ? (
              <p className="text-zinc-500">No backup has run on this computer yet.</p>
            ) : (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
                <dt className="text-zinc-500">Last backup</dt>
                <dd className={backup.ok ? "text-zinc-900" : "font-medium text-red-700"}>
                  {formatDateTime(backup.at)}
                  {backup.ok ? ` · ${backup.sizeKb.toLocaleString()} KB` : ` · failed: ${backup.message}`}
                </dd>
                <dt className="text-zinc-500">On this computer</dt>
                <dd className="break-all text-zinc-700">{backup.dir}</dd>
                <dt className="text-zinc-500">Second copy</dt>
                <dd>
                  {backup.copy === "ok" ? (
                    <span className="break-all text-emerald-700">Copied to {backup.copyDir}</span>
                  ) : backup.copy === "failed" ? (
                    <span className="text-red-700">
                      Could not copy to {backup.copyDir}: {backup.copyMessage}
                    </span>
                  ) : (
                    <span className="text-amber-700">None. The backups exist only on this computer.</span>
                  )}
                </dd>
              </dl>
            )}
            {problem && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{problem}</p>}
            {(!backup || backup.copy !== "ok") && (
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
                To keep a second copy, add one line to the <code>.env</code> file in the POS folder, for example a
                Google Drive folder (install Google Drive for desktop first) or a USB drive:
                <code className="mt-1 block font-mono text-zinc-800">BACKUP_COPY_DIR=&quot;G:\My Drive\pos-backups&quot;</code>
                The next backup copies itself there.
              </p>
            )}
            <BackupNowButton />
          </div>
        </section>
      </div>
    </>
  );
}
