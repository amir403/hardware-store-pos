"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { round2, toNum } from "@/app/lib/format";
import { recordAudit } from "@/app/lib/audit";
import { EXPENSE_CATEGORIES } from "@/app/lib/expense-categories";

export type ExpenseResult = { ok: true } | { error: string };

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce
    .number()
    .positive("Enter an amount greater than zero.")
    .max(99_999_999),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MOBILE", "OTHER"]),
  /** <input type="date">; today when left empty. */
  spentOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
    .optional(),
  note: z.string().trim().max(300).optional(),
});

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today keeps the real time (it matters for the shift count); another day lands at midday. */
function spentAtFor(spentOn: string | undefined, now: Date): Date {
  return !spentOn || spentOn === dayOf(now) ? now : new Date(`${spentOn}T12:00:00`);
}

function revalidateExpenses() {
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/shifts");
  revalidatePath("/");
}

/**
 * Record money spent on running the shop. Anyone at the counter can log one —
 * petty cash goes out of the drawer during the day — but only an admin can
 * remove one afterwards.
 */
export async function createExpenseAction(
  _previous: ExpenseResult | null,
  formData: FormData
): Promise<ExpenseResult> {
  const user = await getActionUser();

  const parsed = expenseSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? "").replace(/,/g, "").trim(),
    method: String(formData.get("method") ?? "CASH"),
    spentOn: String(formData.get("spentOn") ?? "") || undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expense." };
  }
  const data = parsed.data;

  // A back-dated expense lands at midday so it never slips across midnight in
  // either direction; one dated today keeps the real time for the shift count.
  const now = new Date();
  const spentAt = spentAtFor(data.spentOn, now);
  if (spentAt.getTime() > now.getTime()) {
    return { error: "An expense cannot be dated in the future." };
  }

  const expense = await prisma.expense.create({
    data: {
      category: data.category,
      amount: round2(data.amount),
      method: data.method,
      spentAt,
      note: data.note || null,
      userId: user.id,
    },
  });

  await recordAudit({
    userId: user.id,
    action: "expense.create",
    entityType: "Expense",
    entityId: expense.id,
    summary: `${data.category} ${round2(data.amount)} (${data.method})${data.note ? ` · ${data.note}` : ""}`,
    details: { category: data.category, amount: round2(data.amount), method: data.method },
  });

  revalidateExpenses();
  return { ok: true };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) {
    throw new Error("Only an admin can remove a recorded expense.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return;

  await prisma.expense.delete({ where: { id } });
  await recordAudit({
    userId: user.id,
    action: "expense.delete",
    entityType: "Expense",
    entityId: id,
    summary: `Removed ${expense.category} ${toNum(expense.amount)}${expense.note ? ` · ${expense.note}` : ""}`,
    details: {
      category: expense.category,
      amount: toNum(expense.amount),
      spentAt: expense.spentAt.toISOString(),
    },
  });

  revalidateExpenses();
}

/**
 * Correct a recorded expense — most often "Paid by" (rent paid from the bank
 * was entered as drawer cash). Admins and managers only; every change is audited.
 */
export async function updateExpenseAction(
  _previous: ExpenseResult | null,
  formData: FormData
): Promise<ExpenseResult> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN", "MANAGER")) {
    return { error: "Only an admin or manager can change a recorded expense." };
  }

  const id = String(formData.get("id") ?? "");
  const existing = id ? await prisma.expense.findUnique({ where: { id } }) : null;
  if (!existing) return { error: "This expense no longer exists." };

  const parsed = expenseSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? "").replace(/,/g, "").trim(),
    method: String(formData.get("method") ?? "CASH"),
    spentOn: String(formData.get("spentOn") ?? "") || undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expense." };
  }
  const data = parsed.data;

  // Same day as before keeps the original time, so the expense stays in its shift.
  const now = new Date();
  const spentAt =
    data.spentOn && data.spentOn === dayOf(existing.spentAt)
      ? existing.spentAt
      : spentAtFor(data.spentOn, now);
  if (spentAt.getTime() > now.getTime()) {
    return { error: "An expense cannot be dated in the future." };
  }

  const before = {
    category: existing.category,
    amount: toNum(existing.amount),
    method: existing.method,
    spentAt: existing.spentAt.toISOString(),
    note: existing.note,
  };
  const after = {
    category: data.category,
    amount: round2(data.amount),
    method: data.method,
    spentAt: spentAt.toISOString(),
    note: data.note || null,
  };
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
  if (changed.length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { ...after, spentAt },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "expense.update",
        entityType: "Expense",
        entityId: id,
        summary: `${data.category} ${after.amount}: changed ${changed.join(", ")}`,
        details: { before, after },
      },
      tx
    );
  });

  revalidateExpenses();
  return { ok: true };
}
