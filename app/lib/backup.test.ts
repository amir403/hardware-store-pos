import { test } from "node:test";
import assert from "node:assert/strict";
import { backupProblem, type BackupStatus } from "./backup";

const now = new Date("2026-11-24T10:00:00");
const base: BackupStatus = {
  at: new Date("2026-11-23T22:00:00"),
  ok: true,
  message: "ok",
  dir: "E:\\pos-backups",
  file: "hardware_pos.dump",
  sizeKb: 80,
  copy: "ok",
  copyDir: "G:\\My Drive\\pos-backups",
  copyMessage: "",
};

test("backup: a fresh good backup needs nothing; no status file is not an alarm", () => {
  assert.equal(backupProblem(base, now), null);
  assert.equal(backupProblem({ ...base, copy: "none" }, now), null);
  assert.equal(backupProblem(null, now), null);
});

test("backup: failure, a missed copy and two quiet days are flagged", () => {
  assert.match(backupProblem({ ...base, ok: false, message: "pg_dump exit code 1" }, now)!, /failed: pg_dump/);
  assert.match(backupProblem({ ...base, copy: "failed" }, now)!, /second location/);
  assert.match(backupProblem({ ...base, at: new Date("2026-11-21T22:00:00") }, now)!, /No backup for 2 days/);
});
