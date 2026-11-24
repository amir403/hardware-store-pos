"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackupIcon } from "lucide-react";
import { runBackupNowAction } from "@/app/actions/backup";
import { useToast } from "@/app/components/toast";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await runBackupNowAction();
            if ("error" in result) {
              setError(result.error);
              return;
            }
            toast("Backup started. It takes under a minute.");
            // The task writes its status file when it ends; show it then.
            setTimeout(() => router.refresh(), 20_000);
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
      >
        <DatabaseBackupIcon className="h-4 w-4" />
        {pending ? "Starting…" : "Back up now"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
