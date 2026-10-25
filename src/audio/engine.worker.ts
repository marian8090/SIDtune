/// <reference lib="webworker" />
import type { SidAudioEngine } from "libsidplayfp-wasm";
import { applyEmulation, applyMutes, makeEngine, prepare, snapshotRegs, type Roms } from "./engine-factory";
import type { CacheMode, EngineSettings, FromWorker, LevelMessage, ToWorker, TuneDetails } from "./protocol";

const CHUNK_FRAMES = 1024;
const TARGET_BUFFER_S = 0.35;

interface CachedChunk {
  pcm: Int16Array;
  chans: number;
  regs: Uint8Array[];
}

type Wrapper = { fastForwardContext?: (s: number, c: number) => Promise<number>; resetPendingChunk?: () => void };

let sampleRate = 48000;
let settings: EngineSettings;
let roms: Roms = {};
let engine: SidAudioEngine | null = null;
let engineConfigured = false;
let dataPort: MessagePort | null = null;
let cachePort: MessagePort | null = null;

let gen = 0;
let sent = 0; // frames sent to the worklet in this generation
let played = 0; // frames the worklet has consumed in this generation
let baseSec = 0; // tune position that frame 0 of this generation corresponds to
let paused = false;
let busy = false; // load/seek/move in progress
let eof = false;
let tuneData: ArrayBuffer | null = null;
let tuneSong = 0;
let mutes = [false, false, false];

// Where audio comes from: the live emulator, or chunks already rendered into the cache.
let source: "live" | "cache" = "live";
let liveFrames = 0; // frame position of the live emulator
let liveAligned = false; // live chunk k is identical to cache chunk k (only true from a clean start)
let cache: CachedChunk[] = [];
let cacheMode: CacheMode = { mode: "off" };
let cacheDone = false;
let cacheEnded = false; // the cache reached the real end of the tune
let cacheToken = 0;
let cachePos = 0;
let maxChunks = 0;
let pendingSeek: { idx: number; sec: number; gen: number } | null = null;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ---------- cache ----------

function resetCache(mode: CacheMode) {
  cacheToken++;
  cache = [];
  cacheDone = false;
  cacheEnded = false;
  cachePos = 0;
  pendingSeek = null;
  cacheMode = mode;
  maxChunks = mode.mode === "off" ? 0 : Math.ceil((mode.sec * sampleRate) / CHUNK_FRAMES);
  cachePort?.postMessage({ type: "stop" });
  if (mode.mode === "prerender" && tuneData && cachePort) {
    cachePort.postMessage({
      type: "start",
      token: cacheToken,
      data: tuneData.slice(0),
      song: tuneSong,
      settings,
      roms,
      mutes: [...mutes],
      maxChunks,
      sampleRate,
    });
  } else {
    cacheDone = true; // nothing is being rendered in the background
  }
}

function onCachePort(e: MessageEvent) {
  const m = e.data;
  if (m.token !== cacheToken) return;
  if (m.type === "chunk") {
    if (m.idx === cache.length) cache.push({ pcm: m.pcm, chans: m.chans, regs: m.regs });
  } else if (m.type === "done") {
    cacheDone = true;
    cacheEnded = m.ended;
  } else if (m.type === "error") {
    console.warn("[sidtune] background render failed:", m.message);
    cacheMode = { mode: "off" };
    cacheDone = true;
  }
}

/** Is a seek to chunk `idx` answerable from the cache, now or once the background render gets there? */
function cacheCovers(idx: number): "now" | "wait" | "no" {
  if (cacheMode.mode === "off") return "no";
  if (idx < cache.length) return "now";
  if (cacheMode.mode === "prerender" && !cacheDone && idx < maxChunks) return "wait";
  return "no";
}

function activateCache(idx: number, sec: number, g: number) {
  source = "cache";
  cachePos = idx;
  baseSec = sec;
  sent = 0;
  played = 0;
  eof = false;
  pendingSeek = null;
  post({ type: "seeked", gen: g });
}

// ---------- live emulator ----------

/** Moves the live emulator to `frames`: forward costs the distance, anything else restarts the tune. */
async function moveLiveTo(frames: number) {
  const e = engine!;
  const w = e as unknown as Wrapper;
  const delta = (frames - liveFrames) / sampleRate;
  if (Math.abs(delta) > 0.0005) {
    if (delta > 0 && w.fastForwardContext && w.resetPendingChunk) {
      w.resetPendingChunk();
      await w.fastForwardContext(delta, 100000);
    } else {
      await e.loadSidBuffer(new Uint8Array(tuneData!), tuneSong);
      applyMutes(e, mutes);
      await e.seekSeconds(frames / sampleRate);
    }
  }
  liveFrames = frames;
  liveAligned = false;
}

async function loadTune(data: ArrayBuffer, song: number, myGen: number, startAt: number, mode: CacheMode) {
  busy = true;
  try {
    if (!engine) {
      engine = makeEngine(settings, sampleRate);
      await prepare(engine, roms);
      engineConfigured = false;
    }
    tuneData = data;
    tuneSong = song;
    await engine.loadSidBuffer(new Uint8Array(data), song);
    if (!engineConfigured) {
      await applyEmulation(engine, settings);
      engineConfigured = true;
    }
    applyMutes(engine, mutes);
    if (myGen !== gen) return;
    if (startAt > 0) await engine.seekSeconds(startAt);
    baseSec = startAt;
    liveFrames = Math.round(startAt * sampleRate);
    liveAligned = startAt === 0;
    source = "live";
    sent = 0;
    played = 0;
    eof = false;
    resetCache(mode);
    post({ type: "loaded", gen: myGen, info: details(engine) });
  } catch (err) {
    post({ type: "error", gen: myGen, message: err instanceof Error ? err.message : String(err) });
    eof = true;
  } finally {
    busy = false;
  }
}

/** Sends one chunk of PCM to the worklet, tagged with the SID registers that go with it. */
function emit(pcm: Int16Array, chans: number, regs: Uint8Array[], myGen: number) {
  const frames = pcm.length / chans;
  const out = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const l = pcm[i * chans] / 32768;
    out[i * 2] = l;
    out[i * 2 + 1] = chans > 1 ? pcm[i * chans + 1] / 32768 : l;
  }
  dataPort?.postMessage({ gen: myGen, pcm: out }, [out.buffer]);
  post({ type: "meta", gen: myGen, frame: sent, regs });
  sent += frames;
}

async function pump() {
  for (;;) {
    const e = engine;
    if (!e || busy || paused || eof || !e.hasTune() || sent - played >= TARGET_BUFFER_S * sampleRate) {
      await sleep(12);
      continue;
    }
    const myGen = gen;

    if (pendingSeek) {
      // waiting for the background render to reach the seek target
      const p = pendingSeek;
      const state = cacheCovers(p.idx);
      if (state === "now") activateCache(p.idx, p.sec, p.gen);
      else if (state === "wait") await sleep(15);
      else await liveSeek(p.sec, p.gen);
      continue;
    }

    if (source === "cache") {
      if (cachePos < cache.length) {
        const c = cache[cachePos++];
        emit(c.pcm, c.chans, c.regs, myGen);
      } else if (!cacheDone) {
        await sleep(15);
      } else if (cacheEnded) {
        eof = true;
        post({ type: "eof", gen: myGen, frame: sent });
      } else {
        // the cache stopped short of the tune (record mode or a cap): carry on live from here
        busy = true;
        try {
          await moveLiveTo(cachePos * CHUNK_FRAMES);
          source = "live";
        } finally {
          busy = false;
        }
      }
      continue;
    }

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
    const regs = snapshotRegs(e);
    if (cacheMode.mode === "record" && liveAligned && liveFrames === cache.length * CHUNK_FRAMES && cache.length < maxChunks) {
      cache.push({ pcm, chans, regs });
    }
    liveFrames += pcm.length / chans;
    emit(pcm, chans, regs, myGen);
  }
}

async function liveSeek(sec: number, g: number) {
  pendingSeek = null;
  busy = true;
  try {
    await moveLiveTo(Math.round(sec * sampleRate));
    source = "live";
    baseSec = sec;
    sent = 0;
    played = 0;
    eof = false;
    post({ type: "seeked", gen: g });
  } finally {
    busy = false;
  }
}

// ---------- export ----------

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
  const e = makeEngine(settings, sampleRate);
  try {
    await prepare(e, roms);
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

// ---------- messages ----------

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
    case "cache-port":
      cachePort = m.port;
      cachePort.onmessage = onCachePort;
      break;
    case "load":
      gen = m.gen;
      pendingSeek = null;
      await loadTune(m.data, m.song, m.gen, m.startAt, m.cache);
      break;
    case "seek": {
      if (!engine || !tuneData) break;
      gen = m.gen;
      sent = 0;
      played = 0;
      eof = false;
      pendingSeek = null;
      const idx = Math.floor((m.seconds * sampleRate) / CHUNK_FRAMES);
      const covered = cacheCovers(idx);
      if (covered === "now") activateCache(idx, m.seconds, m.gen);
      else if (covered === "wait") pendingSeek = { idx, sec: m.seconds, gen: m.gen };
      else await liveSeek(m.seconds, m.gen);
      break;
    }
    case "pause":
      paused = m.paused;
      break;
    case "mute": {
      mutes[m.voice] = m.muted;
      if (!engine?.hasTune()) break;
      if (source === "cache" && cacheMode.mode !== "off") {
        // cached audio still has the old mix: catch the live emulator up and play from it
        busy = true;
        post({ type: "working", gen });
        try {
          await moveLiveTo(Math.round((baseSec + sent / sampleRate) * sampleRate));
          source = "live";
        } finally {
          busy = false;
          post({ type: "seeked", gen });
        }
      }
      applyMutes(engine, mutes);
      if (cacheMode.mode !== "off") resetCache(cacheMode); // re-render with the new mix
      break;
    }
    case "settings": {
      const needNew = m.settings.engine !== settings.engine;
      settings = m.settings;
      resetCache({ mode: "off" });
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
