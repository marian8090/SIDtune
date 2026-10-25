import type { TuneMeta } from "./types";

function str(b: Uint8Array, off: number, len: number): string {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  let s = "";
  for (let i = off; i < end; i++) s += String.fromCharCode(b[i]);
  return s.trim();
}

/** Reads the PSID/RSID header. Returns null for anything that is not a SID file. */
export function parsePsid(buf: ArrayBuffer, path: string): TuneMeta | null {
  const b = new Uint8Array(buf);
  if (b.length < 0x76) return null;
  const magic = str(b, 0, 4);
  if (magic !== "PSID" && magic !== "RSID") return null;
  const dv = new DataView(buf);
  const version = dv.getUint16(4);
  const songs = Math.max(1, dv.getUint16(14));
  const startSong = Math.min(Math.max(1, dv.getUint16(16)), songs);
  const title = str(b, 0x16, 32);
  const author = str(b, 0x36, 32);
  const released = str(b, 0x56, 32);

  let sids = 1;
  let sidModel = "?";
  let clock = "?";
  if (version >= 2 && b.length >= 0x7c) {
    const flags = dv.getUint16(0x76);
    const c = (flags >> 2) & 3;
    clock = ["?", "PAL", "NTSC", "PAL/NTSC"][c];
    const m = (flags >> 4) & 3;
    sidModel = ["?", "6581", "8580", "6581/8580"][m];
    if (version >= 3) {
      if (b[0x7a]) sids++;
      if (version >= 4 && b[0x7b]) sids++;
    }
  }
  const name = path.split("/").pop() ?? path;
  return {
    path,
    title: title || name.replace(/\.sid$/i, ""),
    author,
    released,
    format: magic,
    version,
    songs,
    startSong,
    sids,
    sidModel,
    clock,
    size: b.length,
    key: `${title} ${author} ${released} ${path}`.toLowerCase(),
  };
}
