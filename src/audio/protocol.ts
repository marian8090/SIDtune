import type { Settings } from "../lib/types";

export type EngineSettings = Pick<Settings, "engine" | "sidModel" | "c64Model" | "digiBoost">;

/** How the playback worker keeps audio around so seeks can be instant. */
export type CacheMode = { mode: "off" } | { mode: "prerender" | "record"; sec: number };

export interface TuneDetails {
  songs: number;
  currentSong: number;
  md5: string | null;
  sidChips: number;
  format: string;
  clock: string;
  infoStrings: string[];
}

/** main -> worker */
export type ToWorker =
  | { type: "init"; sampleRate: number; settings: EngineSettings; roms: { kernal?: Uint8Array; basic?: Uint8Array; chargen?: Uint8Array } }
  | { type: "port"; port: MessagePort }
  | { type: "cache-port"; port: MessagePort }
  | { type: "load"; gen: number; data: ArrayBuffer; song: number; startAt: number; cache: CacheMode }
  | { type: "seek"; gen: number; seconds: number }
  | { type: "pause"; paused: boolean }
  | { type: "mute"; voice: number; muted: boolean }
  | { type: "settings"; settings: EngineSettings }
  | { type: "export"; id: number; data: ArrayBuffer; song: number; seconds: number };

/** worker -> main */
export type FromWorker =
  | { type: "ready" }
  | { type: "loaded"; gen: number; info: TuneDetails }
  | { type: "seeked"; gen: number }
  /** The worker is busy catching its emulator up (e.g. after muting a voice mid-tune). */
  | { type: "working"; gen: number }
  | { type: "error"; gen: number; message: string }
  | { type: "meta"; gen: number; frame: number; regs: Uint8Array[] }
  | { type: "eof"; gen: number; frame: number }
  | { type: "exported"; id: number; wav: ArrayBuffer | null; message?: string };

/** worklet -> main / worker */
export interface LevelMessage {
  type: "level";
  gen: number;
  played: number;
}
