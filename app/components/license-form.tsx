"use client";

import { useActionState, useState } from "react";
import { CopyIcon } from "lucide-react";
import { activateLicenseAction, type LicenseFormState } from "@/app/actions/license";
import { SubmitButton } from "@/app/components/submit-button";

export function LicenseForm({ machine }: { machine: string }) {
  const [state, formAction] = useActionState<LicenseFormState, FormData>(activateLicenseAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">This computer&apos;s code:</span>
        <code className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm font-semibold tracking-wider text-zinc-900">
          {machine}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(machine).then(() => setCopied(true), () => {});
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <CopyIcon className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">Send this code to your POS provider; they send back a licence key for this computer.</p>
      <textarea
        name="licenseKey"
        rows={3}
        required
        spellCheck={false}
        placeholder="HPOS1.…"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
      />
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}
      <div className="w-40">
        <SubmitButton pendingLabel="Checking…">Save licence</SubmitButton>
      </div>
    </form>
  );
}
