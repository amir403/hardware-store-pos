import { cache } from "react";
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { promisify } from "node:util";
import { prisma } from "@/app/lib/prisma";
import { LICENSE_PUBLIC_KEY, licenseState, machineCodeFrom, type LicenseState } from "@/app/lib/license";

let machineCode: Promise<string> | null = null;

/** This computer's code (stable across restarts; changes if Windows is reinstalled). */
export function getMachineCode(): Promise<string> {
  machineCode ??= (async () => {
    if (process.platform === "win32") {
      try {
        const { stdout } = await promisify(execFile)(
          "reg.exe",
          ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
          { timeout: 10_000 }
        );
        const guid = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1];
        if (guid) return machineCodeFrom(guid);
      } catch {
        // fall through to the host name
      }
    }
    return machineCodeFrom(hostname());
  })();
  return machineCode;
}

/** The licence as it applies right now, once per request. */
export const getLicense = cache(async (): Promise<LicenseState & { machine: string }> => {
  const [machine, settings, firstUser] = await Promise.all([
    getMachineCode(),
    prisma.settings.findUnique({ where: { id: "main" }, select: { licenseKey: true } }),
    prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const state = licenseState({
    key: settings?.licenseKey ?? null,
    machine,
    now: new Date(),
    trialStart: firstUser?.createdAt ?? new Date(),
    publicKey: LICENSE_PUBLIC_KEY,
    production: process.env.NODE_ENV === "production",
  });
  return { ...state, machine };
});
