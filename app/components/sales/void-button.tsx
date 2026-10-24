"use client";

import { BanIcon } from "lucide-react";
import { voidSaleAction } from "@/app/actions/sales";
import { ConfirmForm } from "@/app/components/confirm-form";
import { useT } from "@/app/components/lang";

/**
 * Voids a same-day sale that should never have been keyed. A reason is a
 * required form field, so the browser blocks the submit until one is typed and
 * the server checks it again — a void without a traceable reason is not allowed.
 */
export function VoidButton({ saleId, invoiceNo }: { saleId: string; invoiceNo: string }) {
  const t = useT();
  return (
    <ConfirmForm
      action={voidSaleAction}
      message={
        `Void ${invoiceNo}? The stock it took out goes straight back on the ` +
        "shelf and the sale is removed from today's revenue. This cannot be undone."
      }
      successMessage={`${invoiceNo} voided — stock returned`}
      className="flex items-center gap-2 print:hidden"
    >
      <input type="hidden" name="id" value={saleId} />
      <input
        type="text"
        name="reason"
        required
        minLength={3}
        maxLength={200}
        placeholder={t("Reason for void")}
        aria-label={t("Reason for void")}
        className="h-9 w-44 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
      />
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
      >
        <BanIcon className="h-4 w-4" />
        {t("Void sale")}
      </button>
    </ConfirmForm>
  );
}
