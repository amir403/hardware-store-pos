import { PackageIcon } from "lucide-react";

/**
 * A product's photo at a fixed square size, or a neutral icon tile when it has
 * none. Plain <img>: photos are already small WebP served from our own API, so
 * the Next image optimiser would only re-do work.
 */
export function ProductThumb({
  src,
  name,
  size = 40,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-400"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <PackageIcon style={{ width: size * 0.45, height: size * 0.45 }} aria-hidden />
      )}
    </span>
  );
}
