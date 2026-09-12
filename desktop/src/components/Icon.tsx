import type { SVGProps } from "react";

/**
 * Hand-drawn inline SVG icon set — one consistent 24px grid, 1.5px stroke,
 * currentColor. Replaces emoji/unicode glyphs so every icon in the app is
 * drawn from the same system.
 */
export type IconName =
  | "activity"
  | "alert"
  | "book"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "clock"
  | "close"
  | "copy"
  | "eye"
  | "external"
  | "file"
  | "gear"
  | "git-branch"
  | "graph"
  | "hexagon"
  | "history-undo"
  | "home"
  | "info"
  | "layers"
  | "message"
  | "mic"
  | "mic-off"
  | "pen"
  | "plus"
  | "reset"
  | "save"
  | "search"
  | "send"
  | "spark"
  | "waveform";

const PATHS: Record<IconName, React.ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2h.01" />
    </>
  ),
  book: (
    <>
      <path d="M5.5 3A1.5 1.5 0 0 0 4 4.5v15A1.5 1.5 0 0 0 5.5 21H20V3H5.5z" />
      <path d="M5.5 16.5H20" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L19.5 6.5" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  external: (
    <>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2" />
    </>
  ),
  "git-branch": (
    <>
      <path d="M6.5 15V3.5" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="6" r="2.5" />
      <path d="M17.5 9a8 8 0 0 1-8 8" />
    </>
  ),
  graph: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="7.5" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M8.3 6.9 15.7 7.4M6.8 8.3l4 7.4M16.9 9.7l-3.6 6.1" />
    </>
  ),
  hexagon: <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5z" />,
  "history-undo": (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h9.5a6.5 6.5 0 0 1 0 13H10" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.8 21v-6.5h4.4V21" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.2V16" />
      <path d="M12 8.2h.01" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9.5 5L12 13 2.5 8 12 3z" />
      <path d="m21.5 12.5-9.5 5-9.5-5" />
      <path d="m21.5 17-9.5 5-9.5-5" />
    </>
  ),
  message: <path d="M21 14.5a2 2 0 0 1-2 2H8l-4.5 4V5a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2v9.5z" />,
  mic: (
    <>
      <path d="M12 2.5a3 3 0 0 1 3 3V11a3 3 0 0 1-6 0V5.5a3 3 0 0 1 3-3z" />
      <path d="M18.5 11a6.5 6.5 0 0 1-13 0" />
      <path d="M12 17.5V21.5" />
    </>
  ),
  "mic-off": (
    <>
      <path d="M9 5.5a3 3 0 0 1 6 0V11M12 14a3 3 0 0 1-3-3v-2" />
      <path d="M18.5 11a6.5 6.5 0 0 1-1.2 3.8M12 17.5V21.5" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  pen: (
    <>
      <path d="M16.8 3.8a2.3 2.3 0 0 1 3.3 3.3L7.5 19.7 2.8 21l1.3-4.7L16.8 3.8z" />
      <path d="m14.5 6 3.3 3.3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>
  ),
  reset: (
    <>
      <path d="M3.5 8.5A9 9 0 1 1 3 12" />
      <path d="M3 4v4.5h4.5" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v5h7V3" />
      <path d="M7 21v-7h10v7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20.5 20.5-5-5" />
    </>
  ),
  send: (
    <>
      <path d="M4 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  spark: (
    <path d="M12 3.5 13.8 10a2 2 0 0 0 1.4 1.4l6.5 1.8-6.5 1.8a2 2 0 0 0-1.4 1.4L12 23l-1.8-6.6a2 2 0 0 0-1.4-1.4L2.3 13.2l6.5-1.8a2 2 0 0 0 1.4-1.4L12 3.5z" transform="translate(0 -1.2)" />
  ),
  waveform: (
    <>
      <path d="M3.5 12h2" />
      <path d="M8 8.5v7" />
      <path d="M12 5v14" />
      <path d="M16 8.5v7" />
      <path d="M20.5 12h-2" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
