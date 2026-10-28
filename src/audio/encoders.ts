import { Mp3Encoder } from "@breezystack/lamejs";

export interface Tags {
  title: string;
  artist: string;
  released: string;
  track?: number;
}

const year = (released: string) => /\b(19|20)\d\d\b/.exec(released)?.[0] ?? "";

export function encodeWav(pcm: Int16Array, channels: number, rate: number): ArrayBuffer {
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

export function flacTags(t: Tags): Record<string, string> {
  return { TITLE: t.title, ARTIST: t.artist, COPYRIGHT: t.released, DATE: year(t.released), TRACKNUMBER: t.track ? String(t.track) : "" };
}

/** ID3v2.3 tag with Latin-1 text frames (PSID strings are Latin-1 already). */
function id3(t: Tags): Uint8Array<ArrayBuffer> {
  const frames: [string, string][] = [
    ["TIT2", t.title],
    ["TPE1", t.artist],
    ["TCOP", t.released],
    ["TYER", year(t.released)],
    ["TRCK", t.track ? String(t.track) : ""],
  ];
  const parts: number[] = [];
  for (const [id, text] of frames) {
    if (!text) continue;
    const size = text.length + 1;
    parts.push(...[...id].map((c) => c.charCodeAt(0)), size >>> 24, (size >> 16) & 255, (size >> 8) & 255, size & 255, 0, 0, 0);
    for (const c of text) parts.push(c.charCodeAt(0) & 255);
  }
  const n = parts.length;
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127, ...parts]);
}

export function encodeMp3(pcm: Int16Array, channels: number, rate: number, kbps: number, tags: Tags, onProgress?: (f: number) => void): Blob {
  const enc = new Mp3Encoder(channels, rate, kbps);
  const frames = Math.floor(pcm.length / channels);
  const step = 1152 * 16;
  const left = new Int16Array(step);
  const right = new Int16Array(step);
  const out: BlobPart[] = [id3(tags)];
  for (let start = 0; start < frames; start += step) {
    const n = Math.min(step, frames - start);
    for (let i = 0; i < n; i++) {
      left[i] = pcm[(start + i) * channels];
      if (channels === 2) right[i] = pcm[(start + i) * channels + 1];
    }
    const l = left.subarray(0, n);
    const chunk = channels === 2 ? enc.encodeBuffer(l, right.subarray(0, n)) : enc.encodeBuffer(l);
    if (chunk.length) out.push(new Uint8Array(chunk));
    if ((start / step) % 16 === 0) onProgress?.(start / frames);
  }
  const tail = enc.flush();
  if (tail.length) out.push(new Uint8Array(tail));
  return new Blob(out, { type: "audio/mpeg" });
}
