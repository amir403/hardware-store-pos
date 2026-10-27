import Link from "next/link";
import { SearchIcon, XIcon } from "lucide-react";

/**
 * A plain GET search box for list pages: submitting reloads the page with
 * `?q=`, so results are filtered on the server and the URL can be shared.
 */
export function ListSearch({
  action,
  defaultValue,
  placeholder,
  keep = {},
}: {
  /** The page's own path, e.g. "/customers". */
  action: string;
  defaultValue: string;
  placeholder: string;
  /** Other query params to carry along (e.g. an active status filter). */
  keep?: Record<string, string | undefined>;
}) {
  const kept = Object.entries(keep).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  const clearHref = kept.length
    ? `${action}?${new URLSearchParams(kept).toString()}`
    : action;

  return (
    <form action={action} className="mb-4 flex gap-2" role="search">
      {kept.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="relative min-w-0 flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
        />
      </div>
      <button
        type="submit"
        className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
      >
        Search
      </button>
      {defaultValue && (
        <Link
          href={clearHref}
          title="Clear search"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
        >
          <XIcon className="h-4 w-4" />
        </Link>
      )}
    </form>
  );
}
