import Link from "next/link";
import { FileQuestionIcon } from "lucide-react";

/**
 * Shown for `notFound()` (a bad sale/product/purchase id) and for URLs that
 * match no route at all.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
          <FileQuestionIcon className="h-5 w-5" />
        </span>
        <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900">
          404
        </p>
        <h2 className="mt-1 text-base font-medium text-zinc-900">
          We couldn&apos;t find that page or record
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          It may have been deleted, or the link is out of date.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            Dashboard
          </Link>
          <Link
            href="/pos"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            New sale
          </Link>
        </div>
      </div>
    </div>
  );
}
