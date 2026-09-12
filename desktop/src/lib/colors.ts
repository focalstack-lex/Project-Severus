// Palette and freshness-fade logic, mirroring second-brain/build_graph.py
// so the desktop app and the generated graph.html look identical.

export const PALETTE = ["#4f8ef7", "#f75f8e", "#4ff7a8", "#f7c94f", "#b44ff7", "#f78a4f"];
export const FALLBACK_COLOR = "#9aa4b2";
const BACKGROUND: [number, number, number] = [0x0b, 0x0e, 0x14];
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
