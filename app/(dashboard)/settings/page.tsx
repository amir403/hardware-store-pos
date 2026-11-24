import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/app/lib/auth";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime } from "@/app/lib/format";
import { readBackupStatus, backupProblem } from "@/app/lib/backup";
import { PageHeader } from "@/app/components/page-header";
import { SettingsForm } from "@/app/components/settings-form";
import { BackupNowButton } from "@/app/components/backup-now-button";
import { LicenseForm } from "@/app/components/license-form";
import { licenseMessage } from "@/app/components/license-notice";
import { getLicense } from "@/app/lib/license-server";
import { getT } from "@/app/lib/i18n-server";
import { updateSettingsAction } from "@/app/actions/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN")) {
    redirect("/");
  }

  const [settings, backup, license] = await Promise.all([getSettings(), readBackupStatus(), getLicense()]);
  const licenseNote = licenseMessage(license, await getT());
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
            receiptLang: settings.receiptLang,
            cashierMaxDiscountPct: String(settings.cashierMaxDiscountPct),
          }}
        />

        <section id="license" className="mt-6 grid scroll-mt-4 gap-4 rounded-xl border border-zinc-200 bg-white p-5 md:grid-cols-3 md:gap-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Licence</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Each computer needs its own licence key. When it runs out, new bills stop after a short grace period;
              your data, reports and backups are never locked.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm md:col-span-2">
            {license.payload && license.status !== "wrong-machine" && license.status !== "invalid" ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
                <dt className="text-zinc-500">Licensed to</dt>
                <dd className="text-zinc-900">{license.payload.shop}</dd>
                <dt className="text-zinc-500">Valid until</dt>
                <dd className={license.canSell ? "text-zinc-900" : "font-medium text-red-700"}>{license.payload.expires}</dd>
              </dl>
            ) : license.status === "dev" ? (
              <p className="text-zinc-500">Development copy: no licence needed.</p>
            ) : null}
            {licenseNote && (
              <p className={`rounded-lg px-3 py-2 text-xs ${licenseNote.tone === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                {licenseNote.text}
              </p>
            )}
            <LicenseForm machine={license.machine} />
          </div>
        </section>

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
