// Palette and freshness-fade logic, mirroring second-brain/build_graph.py
// so the desktop app and the generated graph.html stay visually aligned.

// Muted information hues: color carries meaning (tag clusters), so it stays
// quiet enough to sit inside the monochrome chrome without turning neon.
export const PALETTE = [
  "#7fa5d6", // blue
  "#d98a9c", // rose
  "#7cc29a", // green
  "#d6bd7d", // gold
  "#b394dd", // violet
  "#d9a678", // amber
];
export const FALLBACK_COLOR = "#8f98a3";
// Must match the app canvas (--bg-canvas) so freshness fade blends into
// the surface notes actually render on.
const BACKGROUND: [number, number, number] = [0x05, 0x05, 0x05];
export const HALF_LIFE_DAYS = 45;

export function tagColors(tags: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [index, tag] of tags.entries()) {
    colors[tag] = PALETTE[index % PALETTE.length];
  }
  return colors;
}

/** Blend a hex color toward the dark background; opacity 1 = untouched, 0 = background. */
export function fade(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const mixed = rgb.map((channel, i) =>
    Math.round(channel * opacity + BACKGROUND[i] * (1 - opacity)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function freshnessOpacity(ageDays: number): number {
  return 0.3 + 0.7 * Math.exp(-ageDays / HALF_LIFE_DAYS);
}
