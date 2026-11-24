"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getActionUser, hasRole } from "@/app/lib/auth";

/**
 * Runs the nightly backup task now. Fixed command, no input from the page;
 * the task itself knows the folder and writes the status file when it ends.
 */
export async function runBackupNowAction(): Promise<{ ok: true } | { error: string }> {
  const user = await getActionUser();
  if (!hasRole(user, "ADMIN")) return { error: "Only an admin can start a backup." };
  if (process.platform !== "win32") return { error: "Backups run on the shop computer only." };
  try {
    await promisify(execFile)("schtasks.exe", ["/Run", "/TN", "Hardware POS backup"], { timeout: 15_000 });
    return { ok: true };
  } catch {
    return { error: 'Could not start the "Hardware POS backup" task. Run scripts\\install-tasks.ps1 once on this computer.' };
  }
}
