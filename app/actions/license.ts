"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { getActionUser, hasRole } from "@/app/lib/auth";
import { recordAudit } from "@/app/lib/audit";
import { LICENSE_PUBLIC_KEY, verifyLicense } from "@/app/lib/license";
import { getMachineCode } from "@/app/lib/license-server";

export type LicenseFormState = { error?: string; ok?: string };

/** Saves a pasted licence key after checking its signature and that it is for this computer. */
export async function activateLicenseAction(_prev: LicenseFormState, formData: FormData): Promise<LicenseFormState> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) return { error: "Only an admin can enter the licence." };

  const key = String(formData.get("licenseKey") ?? "").replace(/\s+/g, "");
  if (!key) return { error: "Paste the licence key." };
  const payload = verifyLicense(key, LICENSE_PUBLIC_KEY);
  if (!payload) return { error: "This key is not valid. Copy it again exactly as you received it." };
  const machine = await getMachineCode();
  if (payload.machine !== machine) {
    return { error: `This key is for computer ${payload.machine}, but this computer is ${machine}. Ask for a key for this computer.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.settings.upsert({
      where: { id: "main" },
      create: { id: "main", licenseKey: key },
      update: { licenseKey: key },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "license.activate",
        entityType: "Settings",
        entityId: "main",
        summary: `Licence for ${payload.shop}, valid until ${payload.expires}`,
      },
      tx
    );
  });

  revalidatePath("/", "layout");
  return { ok: `Licence saved: ${payload.shop}, valid until ${payload.expires}.` };
}
