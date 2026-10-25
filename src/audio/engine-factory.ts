import { SidAudioEngine } from "libsidplayfp-wasm";
import residWasm from "libsidplayfp-wasm/dist/libsidplayfp.wasm?url";
import liteWasm from "libsidplayfp-wasm/dist/sidlite/libsidplayfp.wasm?url";
import type { EngineSettings } from "./protocol";

export interface Roms {
  kernal?: Uint8Array;
  basic?: Uint8Array;
  chargen?: Uint8Array;
}

export function makeEngine(s: EngineSettings, sampleRate: number): SidAudioEngine {
  return new SidAudioEngine({
    sampleRate,
    stereo: true,
    engine: s.engine,
    locateFile: (p: string) => (p.endsWith(".wasm") ? (s.engine === "residfp" ? residWasm : liteWasm) : p),
  });
}

export async function prepare(e: SidAudioEngine, roms: Roms) {
  if (roms.kernal && roms.basic && roms.chargen) await e.setSystemROMs(roms.kernal, roms.basic, roms.chargen);
}

/** The wrapper only builds its C++ context on the first load, so config must follow a load. */
export async function applyEmulation(e: SidAudioEngine, s: EngineSettings) {
  await e.setEmulationConfig({
    sidModel: s.sidModel === "auto" ? "MOS6581" : s.sidModel,
    forceSidModel: s.sidModel !== "auto",
    c64Model: s.c64Model === "auto" ? "PAL" : s.c64Model,
    forceC64Model: s.c64Model !== "auto",
    digiBoost: s.digiBoost,
  });
}

export function applyMutes(e: SidAudioEngine, mutes: boolean[]) {
  const chips = Math.max(1, e.getInstalledSids());
  for (let c = 0; c < chips; c++) for (let v = 0; v < 3; v++) e.mute(c, v, mutes[v]);
}

/** SID register snapshots, one per installed chip. */
export function snapshotRegs(e: SidAudioEngine): Uint8Array[] {
  const regs: Uint8Array[] = [];
  for (let c = 0; c < e.getInstalledSids(); c++) {
    const r = e.getSidStatus(c);
    if (r) regs.push(r.slice());
  }
  return regs;
}
