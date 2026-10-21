"use client";

import { useActionState, useRef } from "react";
import { createExpenseAction, type ExpenseResult } from "@/app/actions/expenses";
import { SubmitButton } from "@/app/components/submit-button";
import { useToast } from "@/app/components/toast";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS } from "@/app/lib/expense-categories";

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-700";

export function ExpenseForm({ today }: { today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  async function submit(
    previous: ExpenseResult | null,
    formData: FormData
  ): Promise<ExpenseResult> {
    const result = await createExpenseAction(previous, formData);
    if ("ok" in result) {
      formRef.current?.reset();
      toast("Expense recorded");
    }
    return result;
  }

  const [state, formAction] = useActionState<ExpenseResult | null, FormData>(
    submit,
    null
  );
  const errorMessage = state && "error" in state ? state.error : null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-category" className={labelClass}>
          Category *
        </label>
        <select
          id="expense-category"
          name="category"
          defaultValue="OTHER"
          className={inputClass}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EXPENSE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-amount" className={labelClass}>
          Amount *
        </label>
        <input
          id="expense-amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-method" className={labelClass}>
            Paid by
          </label>
          <select
            id="expense-method"
            name="method"
            defaultValue="CASH"
            className={inputClass}
          >
            <option value="CASH">Cash (drawer)</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="MOBILE">Mobile</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-date" className={labelClass}>
            Date
          </label>
          <input
            id="expense-date"
            name="spentOn"
            type="date"
            max={today}
            defaultValue={today}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-note" className={labelClass}>
          Note
        </label>
        <input
          id="expense-note"
          name="note"
          maxLength={300}
          placeholder="e.g. October electricity bill"
          className={inputClass}
        />
      </div>

      <p className="text-xs text-zinc-400">
        Cash expenses are taken out of the drawer and lower the shift&apos;s
        expected cash.
      </p>

      <SubmitButton>Record expense</SubmitButton>
    </form>
  );
}
