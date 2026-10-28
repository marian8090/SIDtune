// Minimal FLAC encoder for 16-bit PCM: fixed predictors, stereo decorrelation and partitioned Rice coding.

const BLOCK = 4096;
const MAX_PARTITION_ORDER = 6;

class BitWriter {
  buf: Uint8Array<ArrayBuffer> = new Uint8Array(1 << 16);
  pos = 0; // bytes written
  private acc = 0;
  private n = 0;

  private ensure(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + extra));
    b.set(this.buf.subarray(0, this.pos));
    this.buf = b;
  }

  /** Writes the low `bits` bits of `v` (bits <= 24). */
  write(v: number, bits: number) {
    this.acc = (this.acc << bits) | (v & ((1 << bits) - 1));
    this.n += bits;
    this.ensure(4);
    while (this.n >= 8) {
      this.n -= 8;
      this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
    }
    this.acc &= (1 << this.n) - 1;
  }

  writeSigned(v: number, bits: number) {
    if (bits > 24) {
      this.write(v >> 16, bits - 16);
      this.write(v & 0xffff, 16);
    } else this.write(v, bits);
  }

  zeros(count: number) {
    while (count > 24) {
      this.write(0, 24);
      count -= 24;
    }
    this.write(0, count);
  }

  rice(u: number, k: number) {
    this.zeros(u >>> k);
    this.write(1, 1);
    if (k) this.write(u & ((1 << k) - 1), k);
  }

  align() {
    if (this.n) this.write(0, 8 - this.n);
  }

  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
}

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  CRC8[i] = c;
  let d = i << 8;
  for (let j = 0; j < 8; j++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff;
  CRC16[i] = d;
}

function crc8(b: Uint8Array, from: number, to: number) {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ b[i]];
  return c;
}

function crc16(b: Uint8Array, from: number, to: number) {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]];
  return c;
}

/** Residual of the fixed polynomial predictor of the given order. */
function residual(x: Int32Array, n: number, order: number, out: Int32Array) {
  for (let i = order; i < n; i++) {
    switch (order) {
      case 0: out[i] = x[i]; break;
      case 1: out[i] = x[i] - x[i - 1]; break;
      case 2: out[i] = x[i] - 2 * x[i - 1] + x[i - 2]; break;
      case 3: out[i] = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
      default: out[i] = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    }
  }
}

const zig = (r: number) => (r >= 0 ? r * 2 : -r * 2 - 1);

function riceParam(sum: number, count: number) {
  let k = 0;
  while (k < 14 && count * 2 ** (k + 1) < sum) k++;
  return k;
}

interface Plan {
  order: number;
  partOrder: number;
  params: number[];
  bits: number;
}

/** Picks the partition order and Rice parameters for a residual (estimated cost). */
function planResidual(res: Int32Array, n: number, order: number): Plan {
  let maxPo = 0;
  while (maxPo < MAX_PARTITION_ORDER && n % (2 << maxPo) === 0 && n >> (maxPo + 1) > order) maxPo++;
  const parts = 1 << maxPo;
  const size = n >> maxPo;
  const sums = new Float64Array(parts);
  for (let p = 0; p < parts; p++) {
    let s = 0;
    for (let i = Math.max(p * size, order); i < (p + 1) * size; i++) s += zig(res[i]);
    sums[p] = s;
  }
  let best: Plan | null = null;
  for (let po = maxPo; po >= 0; po--) {
    const count = 1 << po;
    const step = 1 << (maxPo - po);
    const psize = n >> po;
    const params: number[] = [];
    let bits = 6;
    for (let p = 0; p < count; p++) {
      let s = 0;
      for (let q = 0; q < step; q++) s += sums[p * step + q];
      const cnt = p === 0 ? psize - order : psize;
      const k = riceParam(s, cnt);
      params.push(k);
      bits += 4 + cnt * (k + 1) + Math.floor(s / 2 ** k);
    }
    if (!best || bits < best.bits) best = { order, partOrder: po, params, bits };
  }
  return best!;
}

interface Subframe {
  constant: boolean;
  plan: Plan | null;
  res: Int32Array;
  bits: number;
}

function planSubframe(x: Int32Array, n: number, bps: number): Subframe {
  let constant = true;
  for (let i = 1; i < n && constant; i++) constant = x[i] === x[0];
  if (constant) return { constant, plan: null, res: x, bits: 8 + bps };
  let best: Subframe | null = null;
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    const res = new Int32Array(n);
    residual(x, n, order, res);
    const plan = planResidual(res, n, order);
    const bits = 8 + order * bps + plan.bits;
    if (!best || bits < best.bits) best = { constant, plan, res, bits };
  }
  return best!;
}

function writeSubframe(w: BitWriter, x: Int32Array, n: number, bps: number, sf: Subframe) {
  if (sf.constant) {
    w.write(0, 8);
    w.writeSigned(x[0], bps);
    return;
  }
  const { order, partOrder, params } = sf.plan!;
  w.write(0, 1);
  w.write(8 | order, 6);
  w.write(0, 1);
  for (let i = 0; i < order; i++) w.writeSigned(x[i], bps);
  w.write(0, 2);
  w.write(partOrder, 4);
  const psize = n >> partOrder;
  for (let p = 0; p < params.length; p++) {
    const k = params[p];
    w.write(k, 4);
    for (let i = Math.max(p * psize, order); i < (p + 1) * psize; i++) w.rice(zig(sf.res[i]), k);
  }
}

function utf8Number(w: BitWriter, v: number) {
  if (v < 0x80) return w.write(v, 8);
  const bytes: number[] = [];
  let lead = 0x80;
  let mask = 0x3f;
  while (v > mask) {
    bytes.unshift(0x80 | (v & 0x3f));
    v = Math.floor(v / 64);
    lead = 0x80 | (lead >> 1);
    mask >>= 1;
  }
  w.write(lead | v, 8);
  for (const b of bytes) w.write(b, 8);
}

const RATE_CODES: Record<number, number> = { 88200: 1, 176400: 2, 192000: 3, 8000: 4, 16000: 5, 22050: 6, 24000: 7, 32000: 8, 44100: 9, 48000: 10, 96000: 11 };

/** Encodes interleaved 16-bit PCM (mono or stereo) into a FLAC file with Vorbis comment tags. */
export function encodeFlac(pcm: Int16Array, channels: number, rate: number, tags: Record<string, string>, onProgress?: (f: number) => void): Uint8Array<ArrayBuffer> {
  const frames = Math.floor(pcm.length / channels);
  const w = new BitWriter();
  w.bytes(new TextEncoder().encode("fLaC"));

  // STREAMINFO
  w.write(0, 1);
  w.write(0, 7);
  w.write(34, 24);
  w.write(BLOCK, 16);
  w.write(BLOCK, 16);
  w.write(0, 24);
  w.write(0, 24);
  w.write(rate >> 4, 16);
  w.write(rate & 15, 4);
  w.write(channels - 1, 3);
  w.write(15, 5);
  w.write(Math.floor(frames / 2 ** 32) & 15, 4);
  w.write(Math.floor(frames / 65536) & 0xffff, 16);
  w.write(frames & 0xffff, 16);
  w.zeros(128); // MD5 unknown

  // VORBIS_COMMENT
  const enc = new TextEncoder();
  const vendor = enc.encode("SIDtune");
  const entries = Object.entries(tags)
    .filter(([, v]) => v)
    .map(([k, v]) => enc.encode(`${k}=${v}`));
  const le32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]);
  const body = [le32(vendor.length), vendor, le32(entries.length), ...entries.flatMap((e) => [le32(e.length), e])];
  w.write(1, 1);
  w.write(4, 7);
  w.write(body.reduce((n, b) => n + b.length, 0), 24);
  for (const b of body) w.bytes(b);

  const chans = Array.from({ length: 4 }, () => new Int32Array(BLOCK));
  for (let start = 0, num = 0; start < frames; start += BLOCK, num++) {
    const n = Math.min(BLOCK, frames - start);
    const [a, b, mid, side] = chans;
    for (let i = 0; i < n; i++) {
      const j = (start + i) * channels;
      a[i] = pcm[j];
      if (channels === 2) {
        b[i] = pcm[j + 1];
        mid[i] = (a[i] + b[i]) >> 1;
        side[i] = a[i] - b[i];
      }
    }

    let assignment: number;
    let subs: [Int32Array, number, Subframe][];
    if (channels === 2) {
      const sa = planSubframe(a, n, 16);
      const sb = planSubframe(b, n, 16);
      const sm = planSubframe(mid, n, 16);
      const ss = planSubframe(side, n, 17);
      const options: [number, [Int32Array, number, Subframe][]][] = [
        [1, [[a, 16, sa], [b, 16, sb]]],
        [8, [[a, 16, sa], [side, 17, ss]]],
        [9, [[side, 17, ss], [b, 16, sb]]],
        [10, [[mid, 16, sm], [side, 17, ss]]],
      ];
      [assignment, subs] = options.reduce((x, y) => (y[1][0][2].bits + y[1][1][2].bits < x[1][0][2].bits + x[1][1][2].bits ? y : x));
    } else {
      assignment = channels - 1;
      subs = [[a, 16, planSubframe(a, n, 16)]];
    }

    const frameStart = w.pos;
    w.write(0xfff8, 16);
    w.write(7, 4);
    w.write(RATE_CODES[rate] ?? 0, 4);
    w.write(assignment, 4);
    w.write(4, 3);
    w.write(0, 1);
    utf8Number(w, num);
    w.write(n - 1, 16);
    w.write(crc8(w.buf, frameStart, w.pos), 8);
    for (const [x, bps, sf] of subs) writeSubframe(w, x, n, bps, sf);
    w.align();
    w.write(crc16(w.buf, frameStart, w.pos), 16);
    if (num % 64 === 0) onProgress?.(start / frames);
  }
  return w.buf.slice(0, w.pos);
}
