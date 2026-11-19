// Client-safe. Each category gets one stable colour so the counter can tell
// plumbing from electrical at a glance. Full class strings (not built ones) so
// Tailwind ships them.
const TONES = [
  { chip: "border-sky-200 bg-sky-50 text-sky-800", chipOn: "border-sky-600 bg-sky-600 text-white", tile: "bg-sky-100 text-sky-600" },
  { chip: "border-emerald-200 bg-emerald-50 text-emerald-800", chipOn: "border-emerald-600 bg-emerald-600 text-white", tile: "bg-emerald-100 text-emerald-600" },
  { chip: "border-violet-200 bg-violet-50 text-violet-800", chipOn: "border-violet-600 bg-violet-600 text-white", tile: "bg-violet-100 text-violet-600" },
  { chip: "border-amber-200 bg-amber-50 text-amber-800", chipOn: "border-amber-600 bg-amber-600 text-white", tile: "bg-amber-100 text-amber-700" },
  { chip: "border-rose-200 bg-rose-50 text-rose-800", chipOn: "border-rose-600 bg-rose-600 text-white", tile: "bg-rose-100 text-rose-600" },
  { chip: "border-teal-200 bg-teal-50 text-teal-800", chipOn: "border-teal-600 bg-teal-600 text-white", tile: "bg-teal-100 text-teal-600" },
  { chip: "border-indigo-200 bg-indigo-50 text-indigo-800", chipOn: "border-indigo-600 bg-indigo-600 text-white", tile: "bg-indigo-100 text-indigo-600" },
  { chip: "border-lime-300 bg-lime-50 text-lime-800", chipOn: "border-lime-700 bg-lime-700 text-white", tile: "bg-lime-100 text-lime-700" },
] as const;

export type CategoryTone = (typeof TONES)[number];

/** Same category name, same colour, on every screen and every day. */
export function toneFor(category: string | null | undefined): CategoryTone | null {
  if (!category) return null;
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}
