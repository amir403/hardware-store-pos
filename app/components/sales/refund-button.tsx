"use client";

import { Undo2Icon } from "lucide-react";
import { refundSaleAction } from "@/app/actions/sales";
import { ConfirmForm } from "@/app/components/confirm-form";
import { SubmitButton } from "@/app/components/submit-button";

/**
 * Refunds a completed sale in full. Destructive and irreversible (it restocks
 * every tracked line), so it asks for confirmation before submitting.
 */
export function RefundButton({
  saleId,
  invoiceNo,
  total,
}: {
  saleId: string;
  invoiceNo: string;
  total: string;
}) {
  return (
    <ConfirmForm
      action={refundSaleAction}
      message={
        `Refund ${invoiceNo} for ${total}? Every tracked item will go back ` +
        "into stock and the sale will be excluded from revenue reports. " +
        "This cannot be undone."
      }
      successMessage={`${invoiceNo} refunded — stock returned`}
    >
      <input type="hidden" name="id" value={saleId} />
      <SubmitButton
        pendingLabel="Refunding…"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
      >
        <Undo2Icon className="h-4 w-4" />
        Refund sale
      </SubmitButton>
    </ConfirmForm>
  );
}
