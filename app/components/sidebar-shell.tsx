"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftIcon } from "lucide-react";
import { useT } from "@/app/components/lang";

/**
 * The desktop sidebar frame. It starts as an icon rail on the POS screen (the
 * counter needs the width) and full everywhere else; the toggle overrides that
 * until the next page change. Children hide their labels via the
 * `group-data-[collapsed=true]/side:` variant.
 */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const [manual, setManual] = useState<{ path: string; collapsed: boolean } | null>(null);
  const collapsed =
    manual?.path === pathname ? manual.collapsed : pathname.startsWith("/pos");

  return (
    <aside
      data-collapsed={collapsed}
      className={`group/side sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-zinc-950 py-4 transition-[width] duration-200 lg:flex print:hidden ${
        collapsed ? "w-16 px-2" : "w-60 px-4"
      }`}
    >
      {children}
      <button
        type="button"
        onClick={() => setManual({ path: pathname, collapsed: !collapsed })}
        title={collapsed ? t("Expand menu") : t("Collapse menu")}
        aria-label={collapsed ? t("Expand menu") : t("Collapse menu")}
        aria-expanded={!collapsed}
        className="order-first mb-2 flex h-8 items-center gap-3 self-end rounded-lg px-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 group-data-[collapsed=true]/side:self-center"
      >
        <PanelLeftIcon className="h-4.5 w-4.5" strokeWidth={2} />
      </button>
    </aside>
  );
}
