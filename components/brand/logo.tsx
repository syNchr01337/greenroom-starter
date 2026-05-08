import { cn } from "@/lib/utils";

/**
 * The Greenroom logomark.
 *
 * Custom-drawn "G": a near-complete circle stroked in white-on-emerald,
 * with a horizontal bar cutting in from the right at the midline. The bar
 * does double duty — it closes the G shape and reads as a single tick of an
 * audio level meter, which is a quiet nod to what we make.
 *
 * Three variants:
 *   - <Logomark />     just the icon (square, scales freely)
 *   - <Wordmark />     mark + "Greenroom" type
 *   - <LogoFlat />     a single-color version for footers / dark surfaces
 */

export function Logomark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Greenroom"
    >
      {/* Tile background — gradient gives it a subtle dimensional feel */}
      <defs>
        <linearGradient id="gr-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#059669" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#gr-bg)" />

      {/* The mark: a 270° arc with a horizontal bar cutting in at the midline.
         The bar reads as both the closing of the G and a single tick of an
         audio level meter. */}
      <g
        stroke="white"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 27 13.4 A 8 8 0 1 0 27 26.6" />
        <line x1="27" y1="20" x2="20.5" y2="20" />
      </g>
    </svg>
  );
}

export function Wordmark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logomark size={size} />
      <span
        className="font-semibold text-ink-900 tracking-tight"
        style={{ fontSize: Math.round(size * 0.55), letterSpacing: "-0.012em" }}
      >
        Greenroom
      </span>
    </div>
  );
}

/** Single-color stroked version for footers, loading states, etc. */
export function LogoFlat({
  size = 32,
  className,
  color = "currentColor",
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Greenroom"
    >
      <g
        stroke={color}
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 27 13.4 A 8 8 0 1 0 27 26.6" />
        <line x1="27" y1="20" x2="20.5" y2="20" />
      </g>
    </svg>
  );
}
