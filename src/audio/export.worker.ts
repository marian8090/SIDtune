/// <reference lib="webworker" />
// Renders a tune and encodes it to a file on its own thread, so playback keeps running meanwhile.
import { encodeMp3, encodeWav, flacTags, type Tags } from "./encoders";
import { applyEmulation, makeEngine, prepare, type Roms } from "./engine-factory";
import { encodeFlac } from "./flac";
import type { EngineSettings } from "./protocol";

export type AudioFormat = "wav" | "flac" | "mp3";

export interface ExportJob {
  format: AudioFormat;
  data: ArrayBuffer;
  song: number;
  seconds: number;
  settings: EngineSettings;
  roms: Roms;
  tags: Tags;
}

export type ExportReply = { type: "progress"; stage: "render" | "encode"; fraction: number } | { type: "done"; blob: Blob } | { type: "error"; message: string };

const RATE = 44100;
const MP3_KBPS = 256;

const post = (m: ExportReply) => postMessage(m);

self.onmessage = async (ev: MessageEvent<ExportJob>) => {
  const j = ev.data;
  const e = makeEngine(j.settings, RATE);
  try {
    await prepare(e, j.roms);
    await e.loadSidBuffer(new Uint8Array(j.data), j.song);
    await applyEmulation(e, j.settings);
    const total = RATE * e.getChannels() * j.seconds;
    let last = 0;
    const pcm = await e.renderSeconds(j.seconds, undefined, (written) => {
      const f = written / total;
      if (f - last < 0.02) return;
      last = f;
      post({ type: "progress", stage: "render", fraction: f });
    });
    const ch = e.getChannels();
    const progress = (fraction: number) => post({ type: "progress", stage: "encode", fraction });
    let blob: Blob;
    if (j.format === "wav") blob = new Blob([encodeWav(pcm, ch, RATE)], { type: "audio/wav" });
    else if (j.format === "flac") blob = new Blob([encodeFlac(pcm, ch, RATE, flacTags(j.tags), progress)], { type: "audio/flac" });
    else blob = encodeMp3(pcm, ch, RATE, MP3_KBPS, j.tags, progress);
    post({ type: "done", blob });
  } catch (err) {
    post({ type: "error", message: String(err) });
  } finally {
    e.dispose();
  }
};
