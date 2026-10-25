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

export interface Settings {
  engine: "residfp" | "sidlite";
  sidModel: "auto" | "MOS6581" | "MOS8580";
  c64Model: "auto" | "PAL" | "NTSC";
  digiBoost: boolean;
  /** Browse the online HVSC catalogue when the site provides one. */
  hvsc: boolean;
  /** Pre-render tunes in the background so seeking is instant (uses memory and a second thread). */
  seekCache: boolean;
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

/** Longest tune (seconds) kept fully in memory for instant seeking; touch devices get a smaller budget. */
export const SEEK_CACHE_MAX_SEC = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 300 : 600;

/** Phones and tablets get the lighter engine so playback keeps up in real time. */
const touchDevice = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const DEFAULT_SETTINGS: Settings = {
  engine: touchDevice ? "sidlite" : "residfp",
  sidModel: "auto",
  c64Model: "auto",
  digiBoost: true,
  hvsc: true,
  seekCache: true,
  defaultLengthSec: 180,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
};
