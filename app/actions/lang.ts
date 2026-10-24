"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE } from "@/app/lib/i18n";

/** Remember this device's language for a year and redraw every page. */
export async function setLangAction(lang: "en" | "ur"): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang === "ur" ? "ur" : "en", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
