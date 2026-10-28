import { effect, signal } from "@preact/signals";

// Look-and-feel preferences live in localStorage (not IndexedDB) so index.html can apply the theme before the first paint.

export const THEMES = [
  { id: "sidtune", label: "SIDtune Purple", color: "#14102b" },
  { id: "c64", label: "C64 Blue", color: "#352879" },
  { id: "green", label: "Green Phosphor", color: "#020a03" },
  { id: "amber", label: "Amber Phosphor", color: "#0c0700" },
  { id: "mono-dark", label: "Monochrome Dark", color: "#0b0b0b" },
  { id: "mono-light", label: "Monochrome Light", color: "#ffffff" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

function read(key: string): string | null {
  try {
    return localStorage.getItem(`sidtune.${key}`);
  } catch {
    return null;
  }
}

function persist<T>(key: string, s: { value: T }, encode: (v: T) => string) {
  effect(() => {
    const v = encode(s.value);
    try {
      localStorage.setItem(`sidtune.${key}`, v);
    } catch {
      // storage can be unavailable (private mode); the preference then lasts for this visit
    }
  });
}

const storedTheme = read("theme");
export const theme = signal<ThemeId>(THEMES.some((t) => t.id === storedTheme) ? (storedTheme as ThemeId) : "sidtune");
export const tooltips = signal(read("tooltips") !== "off");
export const showWelcome = signal(read("welcome") !== "off");

persist("theme", theme, (v) => v);
persist("tooltips", tooltips, (v) => (v ? "on" : "off"));
persist("welcome", showWelcome, (v) => (v ? "on" : "off"));

effect(() => {
  const t = THEMES.find((x) => x.id === theme.value)!;
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.color);
});

export function cycleTheme(step: 1 | -1) {
  const i = THEMES.findIndex((t) => t.id === theme.value);
  theme.value = THEMES[(i + step + THEMES.length) % THEMES.length].id;
}
