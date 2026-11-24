import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { formatDateTime } from "@/app/lib/format";
import { staleShiftHours } from "@/app/lib/shifts";
import { getT } from "@/app/lib/i18n-server";

/**
 * Red banner for a shift that has been open a day or more: its expected cash
 * mixes several days, so a drawer count can no longer be matched against it.
 * Renders nothing for a fresh shift.
 */
export async function StaleShiftNotice({
  shift,
  showLink = true,
}: {
  shift: { openedAt: Date; openedBy: { name: string | null } } | null;
  showLink?: boolean;
}) {
  if (!shift) return null;
  const hours = staleShiftHours(shift.openedAt);
  if (hours === null) return null;
  const days = Math.floor(hours / 24);
  const t = await getT();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="flex items-start gap-2">
        <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">
            {days === 1
              ? t("The cash register has been open for 1 day")
              : t("The cash register has been open for {days} days", { days })}
          </span>{" "}
          ({t("since")} {formatDateTime(shift.openedAt)}, {shift.openedBy.name ?? "—"}).{" "}
          {t("Count the drawer and close it, then open a new shift each morning so every day's cash can be checked.")}
        </span>
      </p>
      {showLink && (
        <Link
          href="/shifts"
          className="inline-flex h-8 shrink-0 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-500"
        >
          {t("Close shift")}
        </Link>
      )}
    </div>
  );
}
