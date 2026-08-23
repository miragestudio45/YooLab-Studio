/**
 * Official YooLab mark.
 *
 * The only copy of the brand in this repository is the product screenshot at
 * `reference-audit/design/figma.png`, where the icon renders at roughly 60 px.
 * The three shapes below are traced from that bitmap (marching squares over the
 * upsampled alpha, then simplified), so this is the real mark rather than a new
 * one invented for the site. Plate colours are sampled from the same source:
 * #1A5859 at the top left through #247D77 at the bottom right.
 */

const MARK_PATHS = [
  // Upper wings meeting at the junction.
  'M15.9 9.25L18 9.2L21 9.81L23.3 11.63L30 18.24L30.69 16.63L36.66 10.75L38.59 9.63L41.13 9.18L44.13 9.44L45.18 9.75L46.86 11.13L46.38 12.32L33.31 25.38L32.5 25.59Z',
  // Descending stroke.
  'M32.17 25.63L32 26.13L30.88 26.91L30.29 28.25L28.38 30.31L27.25 31.42L26.38 31.65L25 32.75L24.37 34.13L23.28 35.38L20.63 37.27L18 37.79L16 37.72L14 37.33L12.18 36L12.63 34.7L21.57 25.75Z',
  // Lower left leaf.
  'M16.87 20.63L18 20.81L21.5 22.73L21.78 24.13L18 26.32L17.13 26.42L13 24.19L12.78 23.88L13.03 22.88Z',
];

// Traced bounding box of the three shapes, used to recentre the mark inside a
// square plate now that the wordmark sits beside it instead of underneath.
const MARK_CENTER_X = 29.52;
const MARK_CENTER_Y = 23.49;

type BrandMarkProps = {
  size?: number;
  /** `plate` draws the rounded teal tile, `glyph` draws the mark alone. */
  variant?: 'plate' | 'glyph';
  className?: string;
};

export function BrandMark({ size = 36, variant = 'plate', className }: BrandMarkProps) {
  const gradientId = `yoolab-plate-${variant}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 60 60"
      role="img"
      aria-label="YooLab"
      focusable="false"
    >
      {variant === 'plate' && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1A5859" />
              <stop offset="0.55" stopColor="#1F6E68" />
              <stop offset="1" stopColor="#2A8B82" />
            </linearGradient>
          </defs>
          <rect width="60" height="60" rx="15" fill={`url(#${gradientId})`} />
        </>
      )}
      <g
        transform={`translate(30 30) scale(0.92) translate(${-MARK_CENTER_X} ${-MARK_CENTER_Y})`}
        fill={variant === 'plate' ? '#FFFFFF' : 'currentColor'}
        stroke={variant === 'plate' ? '#FFFFFF' : 'currentColor'}
        strokeWidth="0.7"
        strokeLinejoin="round"
      >
        {MARK_PATHS.map((path) => <path key={path.slice(0, 12)} d={path} />)}
      </g>
    </svg>
  );
}

type BrandLockupProps = {
  size?: number;
  tone?: 'dark' | 'light';
  className?: string;
};

export function BrandLockup({ size = 36, tone = 'dark', className }: BrandLockupProps) {
  return (
    <span className={`brand-lockup brand-lockup--${tone}${className ? ` ${className}` : ''}`}>
      <BrandMark size={size} />
      <span className="brand-wordmark">YooLab</span>
    </span>
  );
}
