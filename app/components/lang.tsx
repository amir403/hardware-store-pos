"use client";

import { createContext, useContext, useTransition } from "react";
import { LanguagesIcon } from "lucide-react";
import { setLangAction } from "@/app/actions/lang";
import { translate, type Lang, type T } from "@/app/lib/i18n";

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT(): T {
  const lang = useContext(LangContext);
  return (text, vars) => translate(lang, text, vars);
}

/** Switches this device between English and Roman Urdu. */
export function LangToggle() {
  const lang = useContext(LangContext);
  const [isPending, startTransition] = useTransition();
  const next: Lang = lang === "ur" ? "en" : "ur";

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => setLangAction(next))}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 disabled:opacity-50"
    >
      <LanguagesIcon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
      {lang === "ur" ? "English" : "Roman Urdu"}
    </button>
  );
}
