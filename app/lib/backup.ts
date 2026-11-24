import { readFile } from "node:fs/promises";
import path from "node:path";

/** Written by scripts/backup-db.ps1 after every run (logs/backup-status.json). */
export type BackupStatus = {
  at: Date;
  ok: boolean;
  message: string;
  dir: string;
  file: string;
  sizeKb: number;
  copy: "ok" | "failed" | "none";
  copyDir: string | null;
  copyMessage: string;
};

/** Older than this and the nightly task has missed at least one night. */
export const BACKUP_STALE_HOURS = 48;

/** null when no backup has run on this computer yet (or this is a dev machine). */
export async function readBackupStatus(): Promise<BackupStatus | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "logs", "backup-status.json"), "utf8");
    // PowerShell's UTF8 encoding writes a BOM.
    const json = JSON.parse(raw.replace(/^﻿/, ""));
    const at = new Date(json.at);
    if (Number.isNaN(at.getTime())) return null;
    return {
      at,
      ok: json.ok === true,
      message: String(json.message ?? ""),
      dir: String(json.dir ?? ""),
      file: String(json.file ?? ""),
      sizeKb: Number(json.sizeKb) || 0,
      copy: json.copy === "ok" || json.copy === "failed" ? json.copy : "none",
      copyDir: json.copyDir ? String(json.copyDir) : null,
      copyMessage: String(json.copyMessage ?? ""),
    };
  } catch {
    return null;
  }
}

/** What needs the owner's attention, or null when backups are fine. */
export function backupProblem(status: BackupStatus | null, now: Date): string | null {
  if (!status) return null;
  if (!status.ok) return `The last backup failed: ${status.message}`;
  const hours = (now.getTime() - status.at.getTime()) / 3_600_000;
  if (hours > BACKUP_STALE_HOURS) return `No backup for ${Math.floor(hours / 24)} days`;
  if (status.copy === "failed") return "The backup could not be copied to the second location";
  return null;
}
