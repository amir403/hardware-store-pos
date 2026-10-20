"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 border-t border-white/10 pt-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="truncate text-xs text-zinc-500">
          {role} · {email}
        </p>
      </div>
      <button
        type="button"
        title="Sign out"
        disabled={isPending}
        onClick={() => startTransition(() => logoutAction())}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
