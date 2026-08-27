/**
 * The YooStudio editor icon set.
 *
 * These were `<img src="/asset/ui/yoolab-editor/*.svg">` until this pass, and
 * three things were wrong with that:
 *
 *   1. The files did not match the design. `settings.svg` was a byte-identical
 *      copy of `text.svg` — the "Thiết lập" rail item drew a text cursor where
 *      the source frame has a gear — and `sound.svg` was a loudspeaker where the
 *      content rail has a quaver.
 *   2. Every file was exported with `preserveAspectRatio="none"`, so an icon in
 *      a non-square box was stretched rather than fitted.
 *   3. Their strokes were baked (`#5D7E81`), so the active state had to be faked
 *      with a nine-stop `filter: invert(...) hue-rotate(...)` chain that could
 *      only ever approximate one colour and turned every icon slightly muddy.
 *
 * Drawn here instead, on one 24-unit grid with a 1.6 stroke, in `currentColor`.
 * State is then a colour change like everything else on the page.
 */

type IconProps = { className?: string };

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
};

const Svg = ({ children, className }: IconProps & { children: React.ReactNode }) => (
  <svg {...BASE} className={className}>{children}</svg>
);

/* ------------------------------------------------------------- main rail --- */

export const IconCreate = ({ className }: IconProps) => (
  <Svg className={className}><path d="M12 5.5v13M5.5 12h13" strokeWidth={2.1} /></Svg>
);

/** Mẫu — a storefront: awning, shutter, door. */
export const IconTemplates = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.2 8.2 4.9 4.4h14.2l1.7 3.8" />
    <path d="M3.2 8.2c0 1.5 1.1 2.5 2.4 2.5s2.3-1 2.3-2.5c0 1.5 1.1 2.5 2.4 2.5s2.4-1 2.4-2.5c0 1.5 1.1 2.5 2.4 2.5s2.3-1 2.3-2.5c0 1.5 1 2.5 2.3 2.5" />
    <path d="M4.9 10.7v8.9h14.2v-8.9" />
    <path d="M9.4 19.6v-5.4h5.2v5.4" />
  </Svg>
);

/** Thành phần — square, triangle / cross, circle. */
export const IconComponents = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.2" y="3.6" width="6.6" height="6.6" rx="1.6" />
    <path d="M17.1 3.4 20.8 10H13.4z" />
    <path d="M4 15.3l5 5.1M9 15.3l-5 5.1" />
    <circle cx="17.1" cy="17.5" r="3.4" />
  </Svg>
);

/** Thông tin dự án — two stacked cards, the front one carrying lines. */
export const IconProjectInfo = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8.7 4.6 16 3.1a2 2 0 0 1 2.4 1.6l1.9 9.6a2 2 0 0 1-1.6 2.4l-1.2.2" />
    <rect x="3.5" y="6.6" width="12.2" height="14.3" rx="2.4" transform="rotate(-4 3.5 6.6)" />
    <path d="M7 11.4h6M7 14.6h4.2" />
  </Svg>
);

/** Decor — the four-petal atom with a core, as in the source frame. */
export const IconDecor = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 2.6c2.9 2.6 2.9 6.2 0 8.8-2.9-2.6-2.9-6.2 0-8.8z" />
    <path d="M12 21.4c-2.9-2.6-2.9-6.2 0-8.8 2.9 2.6 2.9 6.2 0 8.8z" />
    <path d="M2.6 12c2.6-2.9 6.2-2.9 8.8 0-2.6 2.9-6.2 2.9-8.8 0z" />
    <path d="M21.4 12c-2.6 2.9-6.2 2.9-8.8 0 2.6-2.9 6.2-2.9 8.8 0z" />
    <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
  </Svg>
);

/** Thiết lập — a gear. The shipped asset for this slot was the text icon. */
export const IconSettings = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.1 14.6a1.6 1.6 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.4v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.4 1h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.4 1z" />
  </Svg>
);

export const IconProjects = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.4 8.1V6.4a2.2 2.2 0 0 1 2.2-2.2h2.9a2 2 0 0 1 1.6.8l1 1.3a2 2 0 0 0 1.6.8h4.7a2.2 2.2 0 0 1 2.2 2.2v8.3a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6z" />
  </Svg>
);

export const IconVrLab = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.6 3.2v4.4L4.9 16a2.6 2.6 0 0 0 2.2 4h9.8a2.6 2.6 0 0 0 2.2-4l-4.7-8.4V3.2" />
    <path d="M8.4 3.2h7.2" />
    <path d="M7.6 13.9h8.8" />
    <circle cx="10.4" cy="16.7" r=".95" fill="currentColor" stroke="none" />
    <circle cx="13.9" cy="16.4" r=".7" fill="currentColor" stroke="none" />
  </Svg>
);

/* ---------------------------------------------------------- rail footer --- */

export const IconBell = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M18.1 10.6a6.1 6.1 0 1 0-12.2 0c0 3.4-.7 5.2-1.4 6.1-.4.5 0 1.2.6 1.2h13.8c.6 0 1-.7.6-1.2-.7-.9-1.4-2.7-1.4-6.1z" />
    <path d="M9.9 20.6a2.6 2.6 0 0 0 4.2 0" />
  </Svg>
);

export const IconGlobe = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.4 12h17.2" />
    <path d="M12 3.4a13.2 13.2 0 0 1 0 17.2 13.2 13.2 0 0 1 0-17.2z" />
  </Svg>
);

/* --------------------------------------------------------------- topbar --- */

export const IconPencil = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.2 19.8h3.3L18.4 8.9a2.3 2.3 0 0 0-3.3-3.3L4.2 16.5z" />
    <path d="M14.3 6.5l3.3 3.3" />
  </Svg>
);

/** The 3D badge in the topbar: a cube seen from a corner. */
export const IconCube3d = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 2.9 20.4 7v10L12 21.1 3.6 17V7z" />
    <path d="M3.6 7 12 11.2 20.4 7M12 11.2v9.9" />
  </Svg>
);

export const IconAi = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6.6 16.2 8.8 8h1.7l2.2 8.2M7.5 13.5h4.7" />
    <path d="M16.1 8v8.2" />
    <path d="M19 3.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6L16.8 5.4l1.6-.6z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconFullscreen = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.3 3.9H5.2a1.3 1.3 0 0 0-1.3 1.3v4.1M14.7 3.9h4.1a1.3 1.3 0 0 1 1.3 1.3v4.1M20.1 14.7v4.1a1.3 1.3 0 0 1-1.3 1.3h-4.1M3.9 14.7v4.1a1.3 1.3 0 0 0 1.3 1.3h4.1" />
  </Svg>
);

export const IconShare = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.6 19.2c0-5.4 3.6-8.4 9.4-8.6V6.2l7.4 6.6-7.4 6.6v-4.5c-4.4 0-7.3 1-9.4 4.3z" />
  </Svg>
);

export const IconChevronDown = ({ className }: IconProps) => (
  <Svg className={className}><path d="m6.4 9.4 5.6 5.5 5.6-5.5" /></Svg>
);

/* --------------------------------------------------------------- canvas --- */

export const IconMenu = ({ className }: IconProps) => (
  <Svg className={className}><path d="M4.2 6.6h15.6M4.2 12h15.6M4.2 17.4h15.6" /></Svg>
);

/** Tắt âm — a struck-through speaker. */
export const IconSilent = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12.9 5.1v13.8l-4.4-3.6H5.2a1 1 0 0 1-1-1V9.7a1 1 0 0 1 1-1h3.3z" />
    <path d="M4 20.6 20.4 3.6" />
  </Svg>
);

export const IconVolume = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12.4 5.1v13.8L8 15.3H4.7a1 1 0 0 1-1-1V9.7a1 1 0 0 1 1-1H8z" />
    <path d="M16.2 9a4.3 4.3 0 0 1 0 6M18.9 6.3a8.1 8.1 0 0 1 0 11.4" />
  </Svg>
);

export const IconReset = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20.1 8.4A8.6 8.6 0 0 0 5 7.1M3.9 15.6A8.6 8.6 0 0 0 19 16.9" />
    <path d="M20.6 3.9v4.6H16M3.4 20.1v-4.6H8" />
  </Svg>
);

export const IconFrame = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="2.4" />
    <rect x="7.9" y="7.9" width="8.2" height="8.2" rx="1.2" />
  </Svg>
);

export const IconVr = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.4 9.4a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v4.1a2 2 0 0 1-2 2h-3.1a2 2 0 0 1-1.6-.8l-.9-1.2a1.3 1.3 0 0 0-2.1 0l-.9 1.2a2 2 0 0 1-1.6.8H5.4a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconShareNodes = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="17.9" cy="5.6" r="2.5" />
    <circle cx="6.1" cy="12" r="2.5" />
    <circle cx="17.9" cy="18.4" r="2.5" />
    <path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4" />
  </Svg>
);

export const IconClose = ({ className }: IconProps) => (
  <Svg className={className}><path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" /></Svg>
);

export const IconUpload = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 15.4V4.6M8.2 8.4 12 4.6l3.8 3.8" />
    <path d="M4.4 14.6v3.4a1.9 1.9 0 0 0 1.9 1.9h11.4a1.9 1.9 0 0 0 1.9-1.9v-3.4" />
  </Svg>
);

/** Thiết lập góc nhìn — a camera target. */
export const IconViewpoint = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="7.3" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
    <path d="M12 2.6v2.5M12 18.9v2.5M2.6 12h2.5M18.9 12h2.5" />
  </Svg>
);

export const IconGrip = ({ className }: IconProps) => (
  <svg {...BASE} strokeWidth={0} className={className}>
    {[8.4, 12, 15.6].map((y) => (
      [9.4, 14.6].map((x) => <circle cx={x} cy={y} r="1.15" fill="currentColor" key={`${x}-${y}`} />)
    ))}
  </svg>
);

/* ---------------------------------------------------------- content rail --- */

/** Quản lý nhãn — two stacked tags. */
export const IconLabels = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M13.4 3.6H19a1.6 1.6 0 0 1 1.6 1.6v5.6a2 2 0 0 1-.6 1.4l-6.6 6.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L12 4.2a2 2 0 0 1 1.4-.6z" />
    <circle cx="16.3" cy="7.7" r="1.5" />
  </Svg>
);

/** Không gian — the bounded volume badge from the source frame. */
export const IconSpace = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4" />
    <path d="m7.4 7.4 3.3 3.3M16.6 7.4l-3.3 3.3M7.4 16.6l3.3-3.3M16.6 16.6l-3.3-3.3" />
    <circle cx="12" cy="12" r="1.9" />
  </Svg>
);

/** Bước — the command loop. */
export const IconSteps = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.2 9.2h5.6v5.6H9.2z" />
    <path d="M9.2 9.2H6.4a2.8 2.8 0 1 1 2.8-2.8zM14.8 9.2h2.8a2.8 2.8 0 1 0-2.8-2.8zM9.2 14.8H6.4a2.8 2.8 0 1 0 2.8 2.8zM14.8 14.8h2.8a2.8 2.8 0 1 1-2.8 2.8z" />
  </Svg>
);

export const IconText = ({ className }: IconProps) => (
  <Svg className={className}><path d="M5.2 6.6V4.9h13.6v1.7M12 4.9v14.2M8.9 19.1h6.2" /></Svg>
);

/** Âm thanh — a beamed quaver pair. The shipped asset was a loudspeaker. */
export const IconAudio = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.4 17.3V5.6l9.2-2v11.7" />
    <path d="M9.4 8.9l9.2-2" />
    <ellipse cx="7" cy="17.6" rx="2.4" ry="2" />
    <ellipse cx="16.2" cy="15.6" rx="2.4" ry="2" />
  </Svg>
);

export const IconMedia = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="3.2" />
    <path d="M3.4 8.6h17.2M8.1 4.6v4M15.9 4.6v4" />
    <path d="m10.9 11.7 3.7 2.3-3.7 2.3z" />
  </Svg>
);

export const IconHotspot = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.4v17.2M3.4 12h17.2" />
    <path d="m9.2 6.2 2.8-2.8 2.8 2.8M9.2 17.8l2.8 2.8 2.8-2.8M6.2 9.2 3.4 12l2.8 2.8M17.8 9.2 20.6 12l-2.8 2.8" />
  </Svg>
);

export const IconInfo = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11.2v5" />
    <circle cx="12" cy="8.1" r=".95" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSticker = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M13.8 3.6a8.4 8.4 0 1 0 6.6 6.6h-3.9a2.7 2.7 0 0 1-2.7-2.7z" />
    <path d="M8.6 14.2a4.3 4.3 0 0 0 3.4 1.6" />
    <circle cx="8.9" cy="9.7" r=".95" fill="currentColor" stroke="none" />
  </Svg>
);

/** Hiệu ứng — the three-star sparkle. */
export const IconEffects = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M10.4 3.9 12 8.3l4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L4.4 9.9l4.4-1.6z" />
    <path d="M17.6 14.1l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    <path d="M18.2 3.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
  </Svg>
);

export const IconQuiz = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.6 3.6h14.8v14.2a2.6 2.6 0 0 1-1.2 2.2l-4.9 3a2.6 2.6 0 0 1-2.6 0l-4.9-3a2.6 2.6 0 0 1-1.2-2.2z" />
    <path d="M9.8 8.6a2.3 2.3 0 1 1 2.9 2.2c-.5.2-.8.6-.8 1.1v.6" />
    <circle cx="11.9" cy="15.6" r=".95" fill="currentColor" stroke="none" />
  </Svg>
);

/* ------------------------------------------------------ timeline toolbar --- */

export const IconUndo = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="6.4" width="16.8" height="13.4" rx="3.4" />
    <path d="M12.9 16.2 9.4 12.7l3.5-3.5" />
    <path d="M9.4 12.7h4.8a3 3 0 0 1 0 6" />
  </Svg>
);

export const IconRedo = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="6.4" width="16.8" height="13.4" rx="3.4" />
    <path d="m11.1 16.2 3.5-3.5-3.5-3.5" />
    <path d="M14.6 12.7H9.8a3 3 0 0 0 0 6" />
  </Svg>
);

export const IconTrash = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.9 6.6h16.2M9.4 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h2.6a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M5.9 6.6l.9 12a2 2 0 0 0 2 1.8h6.4a2 2 0 0 0 2-1.8l.9-12" />
    <path d="M10.2 10.4v6M13.8 10.4v6" />
  </Svg>
);

/** Khớp thời lượng — collapse the selection to the marks. */
export const IconFitRange = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="4.6" width="16.8" height="14.8" rx="3.4" />
    <path d="M8.4 8.4v7.2M15.6 8.4v7.2" />
    <path d="m10.4 10.6 1.6 1.4-1.6 1.4M13.6 10.6 12 12l1.6 1.4" />
  </Svg>
);

export const IconCopy = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="3.6" width="12.4" height="12.4" rx="3" />
    <path d="M8 20.4h9.4a3 3 0 0 0 3-3V8" />
  </Svg>
);

/** Nhân bản — a stacked duplicate. */
export const IconDuplicate = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.6" y="3.6" width="12" height="12" rx="3" />
    <path d="M8.6 20.4h6.8a5 5 0 0 0 5-5V8.6" />
    <circle cx="14.6" cy="14.6" r="4.4" />
  </Svg>
);

/** Lật đối tượng — mirror across the vertical. */
export const IconMirror = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.2v17.6" strokeDasharray="2.6 2.4" />
    <path d="M9.4 6.4v11.2L3.9 17.6z" />
    <path d="M14.6 6.4v11.2h5.5z" />
  </Svg>
);

export const IconCollapse = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.4 12h15.2" />
    <path d="m9 7.6 3-3 3 3M9 16.4l3 3 3-3" />
  </Svg>
);

/* ---------------------------------------------------------- transport --- */

export const IconToStart = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M6.4 5v14" strokeWidth={2} />
    <path d="M19 5.4v13.2L8.6 12z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconToEnd = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M17.6 5v14" strokeWidth={2} />
    <path d="M5 5.4v13.2L15.4 12z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPlay = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M6.6 4.6v14.8L19.4 12z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPause = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M7.4 4.6h3.2v14.8H7.4zM13.4 4.6h3.2v14.8h-3.2z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconStepBack = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M11.6 6.2v11.6L4.4 12z" fill="currentColor" stroke="none" />
    <path d="M15.4 6v12M19.2 6v12" strokeWidth={1.9} />
  </svg>
);

export const IconStepForward = ({ className }: IconProps) => (
  <svg {...BASE} className={className}>
    <path d="M12.4 6.2v11.6L19.6 12z" fill="currentColor" stroke="none" />
    <path d="M8.6 6v12M4.8 6v12" strokeWidth={1.9} />
  </svg>
);

export const IconClock = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="13.1" r="7.5" />
    <path d="M12 9.6v3.5l2.2 1.6" />
    <path d="M4.9 4.4 7.4 2.6M19.1 4.4 16.6 2.6" />
  </Svg>
);

/* -------------------------------------------------------- track glyphs --- */

export const IconModel = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.4 20.2 7.7v8.6L12 20.6 3.8 16.3V7.7z" />
    <path d="M3.8 7.7 12 12l8.2-4.3M12 12v8.6" />
  </Svg>
);

/* --------------------------------------------------------- properties --- */

export const IconPositionAxis = ({ className }: IconProps) => (
  <Svg className={className}><path d="M5.4 4.6v11.8a1.6 1.6 0 0 0 1.6 1.6h11" /><path d="m15.4 14.6 3.4 3.4-3.4 3.4" /></Svg>
);

export const IconRotateAxis = ({ className }: IconProps) => (
  <Svg className={className}><path d="M5.4 4.6v14.4h14.4" /><path d="M5.4 11.2A7.8 7.8 0 0 1 13.2 19" /></Svg>
);

export const IconScaleAxis = ({ className }: IconProps) => (
  <Svg className={className}><path d="M19.4 4.6 6.2 17.8" /><path d="M19.4 10.2v-5.6h-5.6M6.2 12.2v5.6h5.6" /></Svg>
);

export const IconHeightAxis = ({ className }: IconProps) => (
  <Svg className={className}><path d="M12 4.6v14.8" /><path d="m8.6 8 3.4-3.4L15.4 8M8.6 16l3.4 3.4L15.4 16" /></Svg>
);

export const IconWidthAxis = ({ className }: IconProps) => (
  <Svg className={className}><path d="M4.6 12h14.8" /><path d="m8 8.6-3.4 3.4L8 15.4M16 8.6l3.4 3.4-3.4 3.4" /></Svg>
);

export const IconMinus = ({ className }: IconProps) => (
  <Svg className={className}><path d="M6.4 12h11.2" strokeWidth={1.9} /></Svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <Svg className={className}><path d="M12 6.4v11.2M6.4 12h11.2" strokeWidth={1.9} /></Svg>
);

/* ----------------------------------------------------- narrative column --- */

export const IconStoryBuild = ({ className }: IconProps) => <IconModel className={className} />;

export const IconStoryNote = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20.4 14.1a3 3 0 0 1-3 3h-6.1L6.5 20.4v-3.3H5.6a3 3 0 0 1-3-3V6.6a3 3 0 0 1 3-3h11.8a3 3 0 0 1 3 3z" />
    <path d="M7.4 8.9h9.2M7.4 12.2h5.6" />
  </Svg>
);

export const IconStoryTimeline = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.4 7.2h17.2M3.4 12h17.2M3.4 16.8h17.2" />
    <circle cx="8.4" cy="7.2" r="2.1" fill="#fff" />
    <circle cx="15.1" cy="12" r="2.1" fill="#fff" />
    <circle cx="10.2" cy="16.8" r="2.1" fill="#fff" />
  </Svg>
);

export const IconStoryTap = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.6 11.4V5.9a2 2 0 1 1 4 0v8.2" />
    <path d="M13.6 11.2a1.8 1.8 0 0 1 3.6 0v.9" />
    <path d="M17.2 12.1a1.8 1.8 0 0 1 3.6 0v2.7a5.8 5.8 0 0 1-5.8 5.8h-1.9a5.6 5.6 0 0 1-4.3-2l-3-3.6a1.9 1.9 0 0 1 2.7-2.6l1.1 1.1" />
  </Svg>
);
