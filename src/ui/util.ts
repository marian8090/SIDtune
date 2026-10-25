import type { TuneMeta } from "../lib/types";

export function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function coverStyle(t: TuneMeta | null): Record<string, string> {
  if (!t) return {};
  const h = hue(t.author || t.title);
  const h2 = (h + 50) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${h2} 60% 22%))` };
}

export function initials(t: TuneMeta): string {
  return (t.title.match(/[A-Za-z0-9]/g) ?? ["♪"]).slice(0, 2).join("").toUpperCase();
}

export function describe(t: TuneMeta): string {
  const bits: string[] = [t.format];
  if (t.sids > 1) bits.push(`${t.sids}×SID`);
  if (t.sidModel !== "?") bits.push(t.sidModel);
  if (t.clock !== "?") bits.push(t.clock);
  return bits.join(" · ");
}
