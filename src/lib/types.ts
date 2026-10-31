export interface TuneMeta {
  /** Normalised HVSC-style path, e.g. /MUSICIANS/H/Hubbard_Rob/Commando.sid */
  path: string;
  title: string;
  author: string;
  released: string;
  format: "PSID" | "RSID";
  version: number;
  songs: number;
  startSong: number;
  sids: number;
  sidModel: string;
  clock: string;
  size: number;
  /** Lower-cased haystack for search. */
  key: string;
  /** Present for tunes from the online catalogue: where the file lives inside the server packs. */
  remote?: { part: number; offset: number };
  /** Song lengths in seconds, one per subtune, when known. */
  lengths?: number[];
}

export type FxMode = "real" | "pure" | "magic" | "epic" | "mythic";

export interface Settings {
  engine: "residfp" | "sidlite";
  sidModel: "auto" | "MOS6581" | "MOS8580";
  c64Model: "auto" | "PAL" | "NTSC";
  digiBoost: boolean;
  /** Post-processing of the chip output, see src/audio/fx.ts. */
  fxMode: FxMode;
  /** Equalizer offsets in dB for the low (200 Hz), mid (1 kHz) and high (4 kHz) bands. */
  eq: [number, number, number];
  /** Browse the online HVSC catalogue when the site provides one. */
  hvsc: boolean;
  /** Pre-render tunes in the background so seeking is instant (uses memory and a second thread). */
  seekCache: boolean;
  /** With seekCache, render tunes longer than SEEK_CACHE_MAX_SEC in full too, instead of keeping only what has been played. */
  prerenderLong: boolean;
  /** Draw a thin line under the seek bar showing how far the background render has got. */
  showPrerender: boolean;
  defaultLengthSec: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
}

export interface Playlist {
  id: string;
  name: string;
  paths: string[];
}

/** Longest tune (seconds) rendered in full for instant seeking when prerenderLong is off; touch devices get a smaller budget. */
export const SEEK_CACHE_MAX_SEC = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 300 : 600;

/** Phones and tablets get the lighter engine so playback keeps up in real time. */
export const touchDevice = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const DEFAULT_SETTINGS: Settings = {
  engine: touchDevice ? "sidlite" : "residfp",
  sidModel: "auto",
  c64Model: "auto",
  digiBoost: true,
  fxMode: "magic",
  eq: [0, 0, 0],
  hvsc: true,
  seekCache: true,
  prerenderLong: true,
  showPrerender: true,
  defaultLengthSec: 180,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
};
