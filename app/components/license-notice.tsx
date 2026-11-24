import Link from "next/link";
import { formatDate } from "@/app/lib/format";
import { getT } from "@/app/lib/i18n-server";
import type { T } from "@/app/lib/i18n";
import { GRACE_DAYS, type LicenseState } from "@/app/lib/license";

const STILL_WORKS = "Reports, customer payments and backups keep working.";

/** One sentence about the licence, or null when there is nothing to say. */
export function licenseMessage(state: LicenseState, t: T): { tone: "red" | "amber"; text: string } | null {
  const ends = state.payload ? formatDate(new Date(`${state.payload.expires}T12:00:00`)) : "";
  const still = t(STILL_WORKS);
  switch (state.status) {
    case "trial":
      return { tone: "amber", text: t("Trial version: {n} days left. Enter a licence key in Settings to keep selling.", { n: state.daysLeft }) };
    case "trial-ended":
      return { tone: "red", text: `${t("The trial has ended and new bills are stopped until a licence key is entered in Settings.")} ${still}` };
    case "invalid":
    case "wrong-machine": {
      const what = state.status === "invalid" ? t("The saved licence key is not valid.") : t("The licence key is for a different computer.");
      return state.canSell
        ? { tone: "amber", text: `${what} ${t("Trial: {n} days left.", { n: state.daysLeft })}` }
        : { tone: "red", text: `${what} ${t("New bills are stopped.")} ${still}` };
    }
    case "expiring":
      return { tone: "amber", text: t("The licence ends on {date} ({n} days left). Renew it to keep selling.", { date: ends, n: state.daysLeft }) };
    case "grace":
      return {
        tone: "red",
        text: t("The licence expired on {date}. New bills stop in {n} days unless it is renewed.", { date: ends, n: GRACE_DAYS + state.daysLeft + 1 }),
      };
    case "expired":
      return { tone: "red", text: `${t("The licence expired on {date} and new bills are stopped.", { date: ends })} ${still}` };
    default:
      return null;
  }
}

/** Banner over every page. Admins see every notice; others only when selling is stopped or about to be. */
export async function LicenseNotice({ state, isAdmin }: { state: LicenseState; isAdmin: boolean }) {
  const t = await getT();
  const message = licenseMessage(state, t);
  if (!message || (!isAdmin && message.tone !== "red")) return null;
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm print:hidden ${
        message.tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <span>{message.text}</span>
      {isAdmin && (
        <Link href="/settings#license" className="font-medium underline underline-offset-2">
          {t("Licence settings")}
        </Link>
      )}
    </div>
  );
}
