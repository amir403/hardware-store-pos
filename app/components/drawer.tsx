"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { XIcon } from "lucide-react";

/**
 * A panel that slides in from the right over a list page. Open/closed lives in
 * the URL (e.g. `?new=1` or `?edit=id`), so the page decides when to render it
 * and closing is just going back to `closeHref`.
 */
export function Drawer({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.replace(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  return (
    <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <Link
        href={closeHref}
        replace
        scroll={false}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 animate-fade-in bg-zinc-950/30"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md animate-drawer-right flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <Link
            href={closeHref}
            replace
            scroll={false}
            title="Close (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <XIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
