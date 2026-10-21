"use client";

import { useActionState, useState } from "react";
import {
  closeShiftAction,
  openShiftAction,
  type ShiftResult,
} from "@/app/actions/shifts";
import { SubmitButton } from "@/app/components/submit-button";
import { formatMoney, round2 } from "@/app/lib/format";

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

function ErrorNote({ state }: { state: ShiftResult | null }) {
  if (!state || !("error" in state)) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

export function OpenShiftForm() {
  const [state, formAction] = useActionState<ShiftResult | null, FormData>(
    openShiftAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ErrorNote state={state} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="opening-float" className={labelClass}>
          Cash in the drawer now *
        </label>
        <input
          id="opening-float"
          name="openingFloat"
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="0.00"
          className={inputClass}
        />
        <p className="text-xs text-zinc-400">
          Count the change float before the first sale.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="open-note" className={labelClass}>
          Note
        </label>
        <input
          id="open-note"
          name="note"
          maxLength={300}
          placeholder="optional"
          className={inputClass}
        />
      </div>
      <SubmitButton>Open shift</SubmitButton>
    </form>
  );
}

export function CloseShiftForm({
  shiftId,
  expected,
  currency,
}: {
  shiftId: string;
  expected: number;
  currency: string;
}) {
  const [counted, setCounted] = useState("");
  const [state, formAction] = useActionState<ShiftResult | null, FormData>(
    closeShiftAction,
    null
  );

  const variance =
    counted === "" ? null : round2((Number(counted) || 0) - expected);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="shiftId" value={shiftId} />
      <ErrorNote state={state} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="counted-cash" className={labelClass}>
          Cash counted in the drawer *
        </label>
        <input
          id="counted-cash"
          name="countedCash"
          type="number"
          min="0"
          step="0.01"
          required
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      {variance !== null && (
        <p
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            variance === 0
              ? "bg-emerald-50 text-emerald-700"
              : variance > 0
                ? "bg-amber-50 text-amber-800"
                : "bg-red-50 text-red-700"
          }`}
        >
          {variance === 0
            ? "Drawer balances exactly."
            : variance > 0
              ? `${formatMoney(variance, currency)} over`
              : `${formatMoney(-variance, currency)} short`}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="close-note" className={labelClass}>
          Note
        </label>
        <input
          id="close-note"
          name="note"
          maxLength={300}
          placeholder="e.g. 500 taken to bank"
          className={inputClass}
        />
      </div>
      <SubmitButton>Close shift</SubmitButton>
    </form>
  );
}
