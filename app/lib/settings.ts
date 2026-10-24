import { cache } from "react";
import { prisma } from "@/app/lib/prisma";
import { toNum } from "@/app/lib/format";
import {
  isLabelSize,
  isReceiptPaper,
  type LabelSize,
  type ReceiptPaper,
} from "@/app/lib/print-formats";

export type StoreSettings = {
  storeName: string;
  address: string | null;
  phone: string | null;
  currency: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  receiptFooter: string | null;
  receiptPaper: ReceiptPaper;
  labelSize: LabelSize;
  cashierMaxDiscountPct: number;
};

export const getSettings = cache(async (): Promise<StoreSettings> => {
  const settings = await prisma.settings.findUnique({
    where: { id: "main" },
  });

  if (!settings) {
    return {
      storeName: "My Store",
      address: null,
      phone: null,
      currency: "PKR",
      taxRate: 0,
      pricesIncludeTax: true,
      receiptFooter: null,
      receiptPaper: "80mm",
      labelSize: "50x25",
      cashierMaxDiscountPct: 10,
    };
  }

  return {
    storeName: settings.storeName,
    address: settings.address,
    phone: settings.phone,
    currency: settings.currency,
    taxRate: toNum(settings.taxRate),
    pricesIncludeTax: settings.pricesIncludeTax,
    receiptFooter: settings.receiptFooter,
    receiptPaper: isReceiptPaper(settings.receiptPaper) ? settings.receiptPaper : "80mm",
    labelSize: isLabelSize(settings.labelSize) ? settings.labelSize : "50x25",
    cashierMaxDiscountPct: toNum(settings.cashierMaxDiscountPct),
  };
});
