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
}

export interface Settings {
  engine: "residfp" | "sidlite";
  sidModel: "auto" | "MOS6581" | "MOS8580";
  c64Model: "auto" | "PAL" | "NTSC";
  digiBoost: boolean;
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

/** Phones and tablets get the lighter engine so playback keeps up in real time. */
const touchDevice = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const DEFAULT_SETTINGS: Settings = {
  engine: touchDevice ? "sidlite" : "residfp",
  sidModel: "auto",
  c64Model: "auto",
  digiBoost: true,
  defaultLengthSec: 180,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
};
