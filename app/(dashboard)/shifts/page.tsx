import { prisma } from "@/app/lib/prisma";
import { getSettings } from "@/app/lib/settings";
import { formatDateTime, formatMoney, round2, toNum } from "@/app/lib/format";
import { getCashBreakdown, getOpenShift } from "@/app/lib/shifts";
import { PageHeader } from "@/app/components/page-header";
import { CloseShiftForm, OpenShiftForm } from "@/app/components/shifts/shift-forms";

export const metadata = { title: "Cash register" };

export default async function ShiftsPage() {
  const [settings, openShift, history] = await Promise.all([
    getSettings(),
    getOpenShift(),
    prisma.shift.findMany({
      where: { closedAt: { not: null } },
      orderBy: { openedAt: "desc" },
      take: 30,
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
      },
    }),
  ]);
  const currency = settings.currency;
  const cash = openShift ? await getCashBreakdown(openShift, new Date()) : null;

  const rows: { label: string; amount: number; sign: "" | "+" | "−" }[] = cash
    ? [
        { label: "Opening float", amount: cash.openingFloat, sign: "" },
        { label: "Cash sales", amount: cash.cashSales, sign: "+" },
        { label: "Cash received on accounts", amount: cash.cashCollections, sign: "+" },
        { label: "Cash refunds on returns", amount: cash.cashRefunds, sign: "−" },
        { label: "Cash expenses", amount: cash.cashExpenses, sign: "−" },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Cash register"
        description={
          openShift
            ? `Shift open since ${formatDateTime(openShift.openedAt)} · ${openShift.openedBy.name ?? "—"}`
            : "No shift is open"
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {cash && (
            <div className="rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Expected in the drawer
                </h2>
                <p className="text-xs text-zinc-400">
                  Card, bank and mobile payments are not counted — they never
                  reach the drawer.
                </p>
              </div>
              <dl className="divide-y divide-zinc-100 text-sm">
                {rows.map((row) => (
                  <div key={row.label} className="flex justify-between px-5 py-2.5">
                    <dt className="text-zinc-500">{row.label}</dt>
                    <dd className="font-medium text-zinc-900 tabular-nums">
                      {row.sign} {formatMoney(row.amount, currency)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between bg-zinc-50 px-5 py-3 text-base font-semibold text-zinc-900">
                  <dt>Expected cash</dt>
                  <dd className="tabular-nums">{formatMoney(cash.expected, currency)}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Past shifts
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Shift</th>
                  <th className="px-4 py-2.5 text-right font-medium">Expected</th>
                  <th className="px-4 py-2.5 text-right font-medium">Counted</th>
                  <th className="px-4 py-2.5 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-400">
                      No closed shifts yet.
                    </td>
                  </tr>
                )}
                {history.map((shift) => {
                  const expected = toNum(shift.expectedCash);
                  const counted = toNum(shift.countedCash);
                  const variance = round2(counted - expected);
                  return (
                    <tr key={shift.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">
                          {formatDateTime(shift.openedAt)}
                          {shift.closedAt && ` → ${formatDateTime(shift.closedAt)}`}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {shift.openedBy.name ?? "—"}
                          {shift.closedBy && shift.closedBy.name !== shift.openedBy.name
                            ? ` · closed by ${shift.closedBy.name}`
                            : ""}
                          {shift.note ? ` · ${shift.note}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-600">
                        {formatMoney(expected, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-900">
                        {formatMoney(counted, currency)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          variance === 0
                            ? "text-emerald-700"
                            : variance > 0
                              ? "text-amber-700"
                              : "text-red-600"
                        }`}
                      >
                        {variance === 0
                          ? "Balanced"
                          : `${variance > 0 ? "+" : "−"}${formatMoney(Math.abs(variance), currency)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="h-fit rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">
            {openShift ? "Close shift" : "Open shift"}
          </h2>
          {openShift && cash ? (
            <CloseShiftForm
              key={openShift.id}
              shiftId={openShift.id}
              expected={cash.expected}
              currency={currency}
            />
          ) : (
            <OpenShiftForm />
          )}
        </div>
      </div>
    </>
  );
}
