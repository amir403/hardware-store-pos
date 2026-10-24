import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE, translate, type Lang, type T } from "@/app/lib/i18n";

/** This device's chosen language, from its cookie. */
export const getLang = cache(async (): Promise<Lang> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === "ur" ? "ur" : "en";
});

export async function getT(): Promise<T> {
  const lang = await getLang();
  return (text, vars) => translate(lang, text, vars);
}
