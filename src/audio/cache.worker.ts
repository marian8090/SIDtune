/// <reference lib="webworker" />
// Renders a whole tune ahead of time on its own thread so the playback worker can seek instantly.
import type { SidAudioEngine } from "libsidplayfp-wasm";
import { applyEmulation, applyMutes, makeEngine, prepare, snapshotRegs, type Roms } from "./engine-factory";
import type { EngineSettings } from "./protocol";

export interface CacheStart {
  type: "start";
  token: number;
  data: ArrayBuffer;
  song: number;
  settings: EngineSettings;
  roms: Roms;
  mutes: boolean[];
  maxChunks: number;
  sampleRate: number;
}

const CHUNK_FRAMES = 1024;
let port: MessagePort;
let token = -1;
// One engine for the worker's lifetime: building a wasm instance per start made the render lag behind a burst of voice mutes.
let engine: { e: SidAudioEngine; key: string } | null = null;
let next: CacheStart | null = null;
let running = false;

function engineFor(m: CacheStart): SidAudioEngine {
  const key = `${m.settings.engine}@${m.sampleRate}`;
  if (engine?.key !== key) {
    engine?.e.dispose();
    engine = { e: makeEngine(m.settings, m.sampleRate), key };
  }
  return engine.e;
}

async function run(m: CacheStart) {
  const mine = m.token;
  try {
    const e = engineFor(m);
    await prepare(e, m.roms);
    await e.loadSidBuffer(new Uint8Array(m.data), m.song);
    await applyEmulation(e, m.settings);
    applyMutes(e, m.mutes);
    let idx = 0;
    while (token === mine && idx < m.maxChunks) {
      for (let k = 0; k < 8 && idx < m.maxChunks; k++) {
        const pcm = await e.renderFrames(CHUNK_FRAMES);
        if (!pcm.length) {
          port.postMessage({ type: "done", token: mine, ended: true });
          return;
        }
        port.postMessage({ type: "chunk", token: mine, idx, pcm, chans: e.getChannels(), regs: snapshotRegs(e) }, [pcm.buffer]);
        idx++;
      }
      await new Promise((r) => setTimeout(r)); // let stop/start messages in
    }
    if (token === mine) port.postMessage({ type: "done", token: mine, ended: false });
  } catch (err) {
    if (token === mine) port.postMessage({ type: "error", token: mine, message: String(err) });
    engine?.e.dispose();
    engine = null;
  }
}

/** Runs one render at a time; starts that a newer one replaced before they began are skipped. */
async function drain() {
  running = true;
  while (next) {
    const m = next;
    next = null;
    await run(m);
  }
  running = false;
}

self.onmessage = (ev: MessageEvent<{ type: "port"; port: MessagePort }>) => {
  if (ev.data.type !== "port") return;
  port = ev.data.port;
  port.onmessage = (e: MessageEvent<CacheStart | { type: "stop" }>) => {
    if (e.data.type === "stop") {
      token = -1;
      next = null;
    } else {
      token = e.data.token;
      next = e.data;
      if (!running) void drain();
    }
  };
};
