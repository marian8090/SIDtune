import { useEffect, useRef } from "preact/hooks";
import { theme } from "../lib/prefs";
import { audio, current, playing } from "../state";

interface Palette {
  bg: string;
  grid: string;
  scope: string;
  waves: Record<number, string>;
  mix: string;
}

/** Canvas colours come from the theme's --viz-* tokens. */
function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(`--viz-${name}`).trim();
  const text = cs.getPropertyValue("--text").trim();
  return {
    bg: v("bg"),
    grid: text.startsWith("#") && text.length === 7 ? `${text}12` : "rgba(255,255,255,0.05)",
    scope: v("scope"),
    waves: { 1: v("tri"), 2: v("saw"), 4: v("pulse"), 8: v("noise") },
    mix: v("mix"),
  };
}

/** Scrolling piano-roll of what the three voices of each SID chip are doing, plus a scope. */
export function Viz() {
  const roll = useRef<HTMLCanvasElement>(null);
  const scope = useRef<HTMLCanvasElement>(null);
  const info = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rc = roll.current!;
    const sc = scope.current!;
    const r = rc.getContext("2d")!;
    const s = sc.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let pal = readPalette(rc);
    let palTheme = theme.value;
    const fit = () => {
      for (const c of [rc, sc]) {
        c.width = c.clientWidth * dpr;
        c.height = c.clientHeight * dpr;
      }
      r.fillStyle = pal.bg;
      r.fillRect(0, 0, rc.width, rc.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rc);
    const wave = new Float32Array(audio.analyser?.fftSize ?? 2048);
    let raf = 0;
    let lastInfo = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (palTheme !== theme.value) {
        palTheme = theme.value;
        pal = readPalette(rc);
        fit();
      }
      if (!audio.analyser || !playing.value || !rc.width || !sc.width) return;
      const step = Math.max(1, Math.round(2 * dpr));
      r.drawImage(rc, -step, 0);
      r.fillStyle = pal.bg;
      r.fillRect(rc.width - step, 0, step, rc.height);

      const regs = audio.currentRegs();
      const isPal = current.value?.clock !== "NTSC";
      const clk = isPal ? 985248 : 1022730;
      if (regs) {
        const lanes = regs.length * 3;
        const laneH = rc.height / lanes;
        regs.forEach((rg, chip) => {
          for (let v = 0; v < 3; v++) {
            const lane = chip * 3 + v;
            const b = v * 7;
            const freq = rg[b] | (rg[b + 1] << 8);
            const ctl = rg[b + 4];
            const top = lane * laneH;
            r.fillStyle = pal.grid;
            r.fillRect(rc.width - step, top + laneH - 1, step, 1);
            if (!freq || ctl & 0x08) continue;
            const hz = (freq * clk) / 16777216;
            const midi = 69 + 12 * Math.log2(hz / 440);
            const t = Math.min(1, Math.max(0, (midi - 24) / 84));
            const y = top + (1 - t) * (laneH - 4 * dpr);
            r.globalAlpha = ctl & 1 ? 1 : 0.25;
            const w = (ctl >> 4) & 0x0f;
            r.fillStyle = pal.waves[w] ?? (w ? pal.mix : pal.waves[8]);
            r.fillRect(rc.width - step, y, step, 3 * dpr);
            r.globalAlpha = 1;
          }
        });
        if (now - lastInfo > 100 && info.current) {
          lastInfo = now;
          const g = regs[0];
          const cutoff = (g[21] & 7) | (g[22] << 3);
          const mode = [g[24] & 0x10 && "LP", g[24] & 0x20 && "BP", g[24] & 0x40 && "HP"].filter(Boolean).join("+") || "off";
          info.current.textContent = `filter ${mode} · cutoff ${cutoff} · res ${g[23] >> 4} · vol ${g[24] & 15}`;
        }
      }

      audio.analyser.getFloatTimeDomainData(wave);
      s.clearRect(0, 0, sc.width, sc.height);
      s.strokeStyle = pal.scope;
      s.lineWidth = 1.5 * dpr;
      s.beginPath();
      // trigger on a rising zero crossing so the trace holds still
      let start = 0;
      for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { start = i; break; }
      const n = wave.length / 2;
      for (let i = 0; i < n; i++) {
        const x = (i / n) * sc.width;
        const y = sc.height / 2 - wave[start + i] * sc.height * 0.45;
        i ? s.lineTo(x, y) : s.moveTo(x, y);
      }
      s.stroke();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div class="viz">
      <canvas ref={roll} class="viz-roll" />
      <canvas ref={scope} class="viz-scope" />
      <div ref={info} class="viz-info" />
    </div>
  );
}
