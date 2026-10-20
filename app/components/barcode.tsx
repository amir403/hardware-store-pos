import { encodeCode128, moduleCount } from "@/app/lib/barcode";

/**
 * Server-rendered Code 128. Draws rectangles in *module* units and lets the
 * browser scale them, so the bars stay crisp at any print DPI instead of
 * depending on a raster image.
 */
export function Barcode({
  value,
  height = 9,
  moduleWidth = 0.34,
}: {
  value: string;
  /** Bar height in millimetres. */
  height?: number;
  /** Width of the narrowest bar in millimetres (0.30–0.50 is spec-safe). */
  moduleWidth?: number;
}) {
  const runs = encodeCode128(value);
  if (!runs) {
    return (
      <span className="text-[9px] text-red-600">
        “{value}” cannot be encoded
      </span>
    );
  }

  const modules = moduleCount(runs);
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  for (const run of runs) {
    if (run.bar) bars.push({ x, width: run.width });
    x += run.width;
  }

  // Spec minimum quiet zone is 10 modules of white on each side. Extending the
  // viewBox costs no markup and cannot be clipped by the label's own padding.
  const quietZone = 10;
  const span = modules + quietZone * 2;

  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      viewBox={`${-quietZone} 0 ${span} 100`}
      width={`${span * moduleWidth}mm`}
      height={`${height}mm`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="block max-w-full"
    >
      <rect x={-quietZone} y={0} width={span} height={100} fill="#ffffff" />
      {bars.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={0}
          width={bar.width}
          height={100}
          fill="#000000"
        />
      ))}
    </svg>
  );
}
