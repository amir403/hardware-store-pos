"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createExpenseAction,
  updateExpenseAction,
  type ExpenseResult,
} from "@/app/actions/expenses";
import { SubmitButton } from "@/app/components/submit-button";
import { useT } from "@/app/components/lang";
import { useToast } from "@/app/components/toast";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS } from "@/app/lib/expense-categories";

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

const labelClass = "text-sm font-medium text-zinc-700";

export type ExpenseDefaults = {
  id: string;
  category: string;
  amount: number;
  method: string;
  spentOn: string;
  note: string | null;
};

export function ExpenseForm({
  today,
  expense,
  doneHref,
}: {
  today: string;
  /** Editing an existing expense instead of recording a new one. */
  expense?: ExpenseDefaults;
  /** Where to go after a successful save (closes the drawer). */
  doneHref?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const t = useT();
  const router = useRouter();

  async function submit(
    previous: ExpenseResult | null,
    formData: FormData
  ): Promise<ExpenseResult> {
    const result = expense
      ? await updateExpenseAction(previous, formData)
      : await createExpenseAction(previous, formData);
    if ("ok" in result) {
      formRef.current?.reset();
      toast(expense ? t("Expense updated") : t("Expense recorded"));
      if (doneHref) router.replace(doneHref, { scroll: false });
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
      {expense && <input type="hidden" name="id" value={expense.id} />}
      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-category" className={labelClass}>
          {t("Category")} *
        </label>
        <select
          id="expense-category"
          name="category"
          defaultValue={expense?.category ?? "OTHER"}
          className={inputClass}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(EXPENSE_LABELS[c])}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-amount" className={labelClass}>
          {t("Amount *")}
        </label>
        <input
          id="expense-amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          autoFocus={!expense}
          defaultValue={expense?.amount}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-method" className={labelClass}>
            {t("Paid by")}
          </label>
          <select
            id="expense-method"
            name="method"
            defaultValue={expense?.method ?? "CASH"}
            className={inputClass}
          >
            <option value="CASH">{t("Cash (drawer)")}</option>
            <option value="CARD">{t("Card")}</option>
            <option value="BANK_TRANSFER">{t("Bank transfer")}</option>
            <option value="MOBILE">{t("Mobile")}</option>
            <option value="OTHER">{t("Other")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-date" className={labelClass}>
            {t("Date")}
          </label>
          <input
            id="expense-date"
            name="spentOn"
            type="date"
            max={today}
            defaultValue={expense?.spentOn ?? today}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-note" className={labelClass}>
          {t("Note")}
        </label>
        <input
          id="expense-note"
          name="note"
          maxLength={300}
          defaultValue={expense?.note ?? ""}
          placeholder={t("e.g. October electricity bill")}
          className={inputClass}
        />
      </div>

      <p className="text-xs text-zinc-400">
        {t("Cash expenses are taken out of the drawer and lower the shift's expected cash.")}
      </p>

      <SubmitButton>{expense ? t("Save changes") : t("Record expense")}</SubmitButton>
    </form>
  );
}
