import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { formatDateTime } from "@/app/lib/format";
import { staleShiftHours } from "@/app/lib/shifts";

/**
 * Red banner for a shift that has been open a day or more: its expected cash
 * mixes several days, so a drawer count can no longer be matched against it.
 * Renders nothing for a fresh shift.
 */
export function StaleShiftNotice({
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

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="flex items-start gap-2">
        <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">
            The cash register has been open for {days} day{days === 1 ? "" : "s"}
          </span>{" "}
          (since {formatDateTime(shift.openedAt)}, {shift.openedBy.name ?? "unknown"}). Count the drawer and close it, then
          open a new shift each morning so every day&apos;s cash can be checked.
        </span>
      </p>
      {showLink && (
        <Link
          href="/shifts"
          className="inline-flex h-8 shrink-0 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-500"
        >
          Close shift
        </Link>
      )}
    </div>
  );
}
