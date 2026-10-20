/**
 * One loading state for every screen in the dashboard group. The shape mirrors
 * the most common layout (a heading, four stat cards, then a panel) so the
 * skeleton collapses into the real page instead of jumping around.
 */
export default function DashboardLoading() {
  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-zinc-200" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
              <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-100" />
            </div>
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>

      {/* Main panel */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-1/5 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-1/6 animate-pulse rounded bg-zinc-100" />
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
