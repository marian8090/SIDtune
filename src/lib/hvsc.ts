import type { TuneMeta } from "./types";

/** Where the built catalogue (see tools/build-hvsc.mjs) is served from. Empty means the feature is off. */
export const HVSC_URL: string = (import.meta.env.VITE_HVSC_URL ?? (import.meta.env.DEV ? "/hvsc" : "")).replace(/\/$/, "");

export interface Manifest {
  format: number;
  hvsc: string;
  built: string;
  count: number;
  index: string;
  stil: string;
  parts: { name: string; size: number }[];
}

interface IndexFile {
  format: number;
  hvsc: string;
  parts: string[];
  cols: string[];
  rows: unknown[][];
}

const COLS = "path,title,author,released,rsid,version,songs,startSong,sids,sidModel,clock,size,part,offset,lengths";
let parts: string[] = [];

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${HVSC_URL}/manifest.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`catalogue manifest: HTTP ${res.status}`);
  return res.json();
}

export async function fetchText(name: string): Promise<string> {
  const res = await fetch(`${HVSC_URL}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

export function parseIndex(text: string): { hvsc: string; tunes: TuneMeta[] } {
  const idx = JSON.parse(text) as IndexFile;
  if (idx.format !== 1 || idx.cols.join(",") !== COLS) throw new Error("unsupported catalogue format");
  parts = idx.parts;
  const tunes = idx.rows.map((r): TuneMeta => {
    const [path, title, author, released, rsid, version, songs, startSong, sids, sidModel, clock, size, part, offset, lengths] = r as [
      string, string, string, string, number, number, number, number, number, string, string, number, number, number, number[],
    ];
    return {
      path, title, author, released,
      format: rsid ? "RSID" : "PSID",
      version, songs, startSong, sids, sidModel, clock, size,
      key: `${title} ${author} ${released} ${path}`.toLowerCase(),
      remote: { part, offset },
      lengths,
    };
  });
  return { hvsc: idx.hvsc, tunes };
}

/** Downloads one tune from its pack with an HTTP Range request. */
export async function fetchRemoteTune(t: TuneMeta): Promise<ArrayBuffer> {
  if (!t.remote) throw new Error("not an online tune");
  const { part, offset } = t.remote;
  const res = await fetch(`${HVSC_URL}/${parts[part]}`, { headers: { Range: `bytes=${offset}-${offset + t.size - 1}` } });
  if (res.status === 206) return res.arrayBuffer();
  void res.body?.cancel();
  if (res.status === 200) throw new Error("the HVSC server does not support range requests");
  throw new Error(`the HVSC server answered HTTP ${res.status}`);
}

/** Downloads a whole pack, reporting bytes as they arrive. */
export async function fetchPack(part: number, signal: AbortSignal, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(`${HVSC_URL}/${parts[part]}`, { signal });
  if (!res.ok || !res.body) throw new Error(`the HVSC server answered HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}
