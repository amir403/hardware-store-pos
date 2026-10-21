import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Every action the audit page knows how to label. Keeping the list here means
 * a typo in an action name is a type error rather than an unfilterable row.
 */
export const AUDIT_ACTIONS = {
  "sale.refund": "Sale refunded",
  "sale.void": "Sale voided",
  "sale.return": "Items returned",
  "payment.delete": "Customer payment removed",
  "supplierPayment.delete": "Supplier payment removed",
  "stock.adjust": "Stock adjusted",
  "product.price": "Price changed",
  "user.create": "User created",
  "user.update": "User changed",
  "settings.update": "Settings changed",
  "expense.create": "Expense recorded",
  "expense.delete": "Expense removed",
  "shift.open": "Shift opened",
  "shift.close": "Shift closed",
  "quotation.convert": "Quotation converted",
  "quotation.cancel": "Quotation cancelled",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export type AuditEntry = {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
};

/**
 * Write one audit row. Pass the transaction client when the change itself runs
 * in a transaction, so the record and the change succeed or fail together.
 */
export async function recordAudit(
  entry: AuditEntry,
  client: Prisma.TransactionClient = prisma
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      details: entry.details,
    },
  });
}
