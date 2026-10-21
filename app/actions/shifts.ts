"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getActionUser } from "@/app/lib/auth";
import { round2 } from "@/app/lib/format";
import { recordAudit } from "@/app/lib/audit";
import { getCashBreakdown, getOpenShift } from "@/app/lib/shifts";

export type ShiftResult = { ok: true } | { error: string };

const moneyField = z.coerce
  .number({ message: "Enter an amount." })
  .min(0, "The amount cannot be negative.")
  .max(99_999_999);

const openSchema = z.object({
  openingFloat: moneyField,
  note: z.string().trim().max(300).optional(),
});

const closeSchema = z.object({
  shiftId: z.string().min(1),
  countedCash: moneyField,
  note: z.string().trim().max(300).optional(),
});

function revalidateShifts() {
  revalidatePath("/shifts");
  revalidatePath("/pos");
  revalidatePath("/");
}

/** Start the day: count the float into the drawer. Any signed-in user. */
export async function openShiftAction(
  _previous: ShiftResult | null,
  formData: FormData
): Promise<ShiftResult> {
  const user = await getActionUser();

  const parsed = openSchema.safeParse({
    openingFloat: String(formData.get("openingFloat") ?? "").replace(/,/g, "").trim(),
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid amount." };
  }
  const data = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    if (await getOpenShift(tx)) {
      return { error: "A shift is already open. Close it before opening another." };
    }
    const shift = await tx.shift.create({
      data: {
        openedById: user.id,
        openingFloat: round2(data.openingFloat),
        note: data.note || null,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "shift.open",
        entityType: "Shift",
        entityId: shift.id,
        summary: `Opened with ${round2(data.openingFloat)} in the drawer`,
        details: { openingFloat: round2(data.openingFloat) },
      },
      tx
    );
    return { ok: true as const };
  });

  revalidateShifts();
  return result;
}

/**
 * End the shift: the cashier counts the drawer, and the difference from what
 * the system expects is frozen onto the shift and written to the audit log.
 */
export async function closeShiftAction(
  _previous: ShiftResult | null,
  formData: FormData
): Promise<ShiftResult> {
  const user = await getActionUser();

  const parsed = closeSchema.safeParse({
    shiftId: String(formData.get("shiftId") ?? ""),
    countedCash: String(formData.get("countedCash") ?? "").replace(/,/g, "").trim(),
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid amount." };
  }
  const data = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findFirst({
      where: { id: data.shiftId, closedAt: null },
    });
    if (!shift) return { error: "This shift is already closed." };

    const closedAt = new Date();
    const cash = await getCashBreakdown(shift, closedAt, tx);
    const counted = round2(data.countedCash);
    const variance = round2(counted - cash.expected);

    await tx.shift.update({
      where: { id: shift.id },
      data: {
        closedAt,
        closedById: user.id,
        expectedCash: cash.expected,
        countedCash: counted,
        note: [shift.note, data.note].filter(Boolean).join("\n") || null,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        action: "shift.close",
        entityType: "Shift",
        entityId: shift.id,
        summary:
          variance === 0
            ? `Closed: drawer balanced at ${counted}`
            : `Closed: counted ${counted}, expected ${cash.expected} (${variance > 0 ? "+" : ""}${variance})`,
        details: { ...cash, counted, variance, note: data.note ?? null },
      },
      tx
    );
    return { ok: true as const };
  });

  revalidateShifts();
  return result;
}
