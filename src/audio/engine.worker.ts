/// <reference lib="webworker" />
import { SidAudioEngine } from "libsidplayfp-wasm";
import residWasm from "libsidplayfp-wasm/dist/libsidplayfp.wasm?url";
import liteWasm from "libsidplayfp-wasm/dist/sidlite/libsidplayfp.wasm?url";
import type { EngineSettings, FromWorker, LevelMessage, ToWorker, TuneDetails } from "./protocol";

const CHUNK_FRAMES = 1024;
const TARGET_BUFFER_S = 0.35;

let sampleRate = 48000;
let settings: EngineSettings;
let roms: { kernal?: Uint8Array; basic?: Uint8Array; chargen?: Uint8Array } = {};
let engine: SidAudioEngine | null = null;
let dataPort: MessagePort | null = null;

let gen = 0;
let sent = 0; // frames sent in this generation
let played = 0; // frames consumed by the worklet in this generation
let paused = false;
let busy = false; // load/seek in progress
let eof = false;
let tuneData: ArrayBuffer | null = null;
let tuneSong = 0;
let mutes = [false, false, false];
let engineConfigured = false;
let baseSec = 0; // tune position that frame 0 of the current generation corresponds to

type Wrapper = { fastForwardContext?: (s: number, c: number) => Promise<number>; resetPendingChunk?: () => void };

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

function makeEngine(s: EngineSettings): SidAudioEngine {
  return new SidAudioEngine({
    sampleRate,
    stereo: true,
    engine: s.engine,
    locateFile: (p: string) => (p.endsWith(".wasm") ? (s.engine === "residfp" ? residWasm : liteWasm) : p),
  });
}

/** The wrapper only builds its C++ context on the first load, so config must follow a load. */
async function applyEmulation(e: SidAudioEngine, s: EngineSettings) {
  await e.setEmulationConfig({
    sidModel: s.sidModel === "auto" ? "MOS6581" : s.sidModel,
    forceSidModel: s.sidModel !== "auto",
    c64Model: s.c64Model === "auto" ? "PAL" : s.c64Model,
    forceC64Model: s.c64Model !== "auto",
    digiBoost: s.digiBoost,
  });
}

async function prepare(e: SidAudioEngine) {
  if (roms.kernal && roms.basic && roms.chargen) await e.setSystemROMs(roms.kernal, roms.basic, roms.chargen);
}

function details(e: SidAudioEngine): TuneDetails {
  const i = e.getTuneInfo()!;
  return {
    songs: i.songs,
    currentSong: i.currentSong,
    md5: e.getTuneMd5(),
    sidChips: e.getInstalledSids(),
    format: i.format,
    clock: i.clock,
    infoStrings: i.infoStrings,
  };
}

function applyMutes(e: SidAudioEngine) {
  const chips = Math.max(1, e.getInstalledSids());
  for (let c = 0; c < chips; c++) for (let v = 0; v < 3; v++) e.mute(c, v, mutes[v]);
}

async function loadTune(data: ArrayBuffer, song: number, myGen: number, startAt: number) {
  busy = true;
  try {
    if (!engine) {
      engine = makeEngine(settings);
      await prepare(engine);
      engineConfigured = false;
    }
    tuneData = data;
    tuneSong = song;
    await engine.loadSidBuffer(new Uint8Array(data), song);
    if (!engineConfigured) {
      await applyEmulation(engine, settings);
      engineConfigured = true;
    }
    applyMutes(engine);
    if (myGen !== gen) return;
    if (startAt > 0) await engine.seekSeconds(startAt);
    baseSec = startAt;
    sent = 0;
    played = 0;
    eof = false;
    post({ type: "loaded", gen: myGen, info: details(engine) });
  } catch (err) {
    post({ type: "error", gen: myGen, message: err instanceof Error ? err.message : String(err) });
    eof = true;
  } finally {
    busy = false;
  }
}

async function pump() {
  for (;;) {
    const e = engine;
    if (!e || busy || paused || eof || !e.hasTune() || sent - played >= TARGET_BUFFER_S * sampleRate) {
      await new Promise((r) => setTimeout(r, 12));
      continue;
    }
    const myGen = gen;
    let pcm: Int16Array;
    try {
      pcm = await e.renderFrames(CHUNK_FRAMES);
    } catch (err) {
      post({ type: "error", gen: myGen, message: String(err) });
      eof = true;
      continue;
    }
    if (myGen !== gen || busy) continue;
    if (pcm.length === 0) {
      eof = true;
      post({ type: "eof", gen: myGen, frame: sent });
      continue;
    }
    const chans = e.getChannels();
    const frames = pcm.length / chans;
    const out = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const l = pcm[i * chans] / 32768;
      out[i * 2] = l;
      out[i * 2 + 1] = chans > 1 ? pcm[i * chans + 1] / 32768 : l;
    }
    const regs: Uint8Array[] = [];
    for (let c = 0; c < e.getInstalledSids(); c++) {
      const r = e.getSidStatus(c);
      if (r) regs.push(r.slice());
    }
    dataPort?.postMessage({ gen: myGen, pcm: out }, [out.buffer]);
    post({ type: "meta", gen: myGen, frame: sent, regs });
    sent += frames;
  }
}

function encodeWav(pcm: Int16Array, channels: number, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}

async function exportWav(id: number, data: ArrayBuffer, song: number, seconds: number) {
  const e = makeEngine(settings);
  try {
    await prepare(e);
    await e.loadSidBuffer(new Uint8Array(data), song);
    await applyEmulation(e, settings);
    const pcm = await e.renderSeconds(seconds);
    const wav = encodeWav(pcm, e.getChannels(), sampleRate);
    post({ type: "exported", id, wav }, [wav]);
  } catch (err) {
    post({ type: "exported", id, wav: null, message: String(err) });
  } finally {
    e.dispose();
  }
}

async function handle(m: ToWorker) {
  switch (m.type) {
    case "init":
      sampleRate = m.sampleRate;
      settings = m.settings;
      roms = m.roms;
      post({ type: "ready" });
      void pump();
      break;
    case "port":
      dataPort = m.port;
      dataPort.onmessage = (e: MessageEvent<LevelMessage>) => {
        if (e.data.gen === gen) played = e.data.played;
      };
      break;
    case "load":
      gen = m.gen;
      await loadTune(m.data, m.song, m.gen, m.startAt);
      break;
    case "seek":
      if (!engine || !tuneData) break;
      gen = m.gen;
      busy = true;
      try {
        // Seeking forward continues from the current emulation state, which costs only the
        // distance travelled. Anything else restarts the tune and runs up to the target.
        const w = engine as unknown as Wrapper;
        const rendered = baseSec + sent / sampleRate;
        if (m.seconds >= rendered && w.fastForwardContext && w.resetPendingChunk) {
          w.resetPendingChunk();
          await w.fastForwardContext(m.seconds - rendered, 100000);
        } else {
          await engine.loadSidBuffer(new Uint8Array(tuneData), tuneSong);
          applyMutes(engine);
          await engine.seekSeconds(m.seconds);
        }
        baseSec = m.seconds;
        sent = 0;
        played = 0;
        eof = false;
        post({ type: "seeked", gen: m.gen });
      } finally {
        busy = false;
      }
      break;
    case "pause":
      paused = m.paused;
      break;
    case "mute":
      mutes[m.voice] = m.muted;
      if (engine?.hasTune()) applyMutes(engine);
      break;
    case "settings": {
      const needNew = m.settings.engine !== settings.engine;
      settings = m.settings;
      if (needNew) {
        engine?.dispose();
        engine = null;
      } else if (engine) {
        busy = true;
        try {
          if (engine.hasTune()) await applyEmulation(engine, settings);
          else engineConfigured = false;
        } finally {
          busy = false;
        }
      }
      break;
    }
    case "export":
      void exportWav(m.id, m.data, m.song, m.seconds);
      break;
  }
}

// Messages run one at a time so a load never overlaps a settings change or seek.
let chain: Promise<void> = Promise.resolve();
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  chain = chain.then(() => handle(ev.data)).catch((err) => console.error("[sidtune worker]", err));
};
