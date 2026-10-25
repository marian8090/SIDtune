import type { FxMode } from "../lib/types";

// Audio quality modes, ported from ultraSID's SIDEffects chain (same parameter values).
//
//   REAL            cheap TV speaker: mains hum, speaker EQ, tanh distortion, hiss
//   PURE            the raw chip, only inaudible subsonics removed
//   MAGIC/EPIC/MYTHIC  one chain at three intensities: an LR8 crossover keeps the bass mono and
//                   untouched while the highs get mono-compatible widening, a ping-pong delay and
//                   a reverb (all send-style, added on top of the dry signal), then a 3-band EQ.
//
// Everything is plain Web Audio nodes, so it runs on the audio thread. Mode changes glide.

export const FX_MODES: { id: FxMode; label: string; blurb: string }[] = [
  { id: "real", label: "Real", blurb: "Through a tiny monitor speaker, as most people heard it in the eighties" },
  { id: "pure", label: "Pure", blurb: "The raw chip, nothing added" },
  { id: "magic", label: "Magic", blurb: "Mild stereo widening, light delay and reverb. The recommended default" },
  { id: "epic", label: "Epic", blurb: "The same chain turned up: wide, deep delay and reverb, bold bass" },
  { id: "mythic", label: "Mythic", blurb: "Everything cranked to 11" },
];

interface ModeParams {
  real: boolean;
  width: number;
  delayWet: number;
  delayFeedback: number;
  reverbWet: number;
  extraLowDb: number;
  trimDb: number;
  eqDb: [number, number, number];
}

const FLAT: [number, number, number] = [0, 0, 0];
const FX_EQ: [number, number, number] = [4, 2, 3];

const MODES: Record<FxMode, ModeParams> = {
  real: { real: true, width: 0, delayWet: 0, delayFeedback: 0.42, reverbWet: 0, extraLowDb: 0, trimDb: -8.5, eqDb: FLAT },
  pure: { real: false, width: 0, delayWet: 0, delayFeedback: 0.42, reverbWet: 0, extraLowDb: 0, trimDb: -5, eqDb: FLAT },
  magic: { real: false, width: 0.5, delayWet: 0.17, delayFeedback: 0.42, reverbWet: 0.32, extraLowDb: 0, trimDb: -7, eqDb: FX_EQ },
  epic: { real: false, width: 0.8, delayWet: 0.31, delayFeedback: 0.55, reverbWet: 0.45, extraLowDb: 1.5, trimDb: -7, eqDb: FX_EQ },
  mythic: { real: false, width: 1.0, delayWet: 0.46, delayFeedback: 0.71, reverbWet: 0.6, extraLowDb: 3, trimDb: -8, eqDb: FX_EQ },
};

const SPLITTER_HZ = 200; // magic_splitter_freq 0.2
const SPLITTER_PARK_HZ = 10; // PURE parks the crossover below the audible band
const SPLITTER_LOW_GAIN_DB = 1.5; // magic_splitter_lowGain 0.15 * 10
const LR8_Q = [0.541196100146197, 0.541196100146197, 1.30656296487637653, 1.30656296487637653];
const EQ_HZ = [200, 1000, 4000];
const WIDE_MONO_DELAY_S = 512 / 44100;
const PING_PONG_S = 32768 / 44100;
const FX_NOISE = 0.05 * 0.05; // volume slider 0.05, squared
const REAL_NOISE = 0.12 * 0.12;
const REAL_HUM = 0.07 * 0.07;
const REAL_DISTORTION = 1.75;
const NOISE_COLOR = 0.5 * 0.5;
const HUM_HARMONICS = 16;

const dbToLin = (db: number) => 10 ** (db / 20);
/** Web Audio's lowpass/highpass Q is in dB, the filter maths here uses linear Q. */
const qDb = (q: number) => 20 * Math.log10(q);

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, gainDb = 0, q?: number, qIsDb = false) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.gain.value = gainDb;
  if (q !== undefined) f.Q.value = qIsDb ? qDb(q) : q;
  return f;
}

function chain(nodes: AudioNode[]): { first: AudioNode; last: AudioNode } {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return { first: nodes[0], last: nodes[nodes.length - 1] };
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  let seed = 12345;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let cur = 0;
    for (let i = 0; i < d.length; i++) {
      seed = (Math.imul(1103515245, seed) + 12345) >>> 0;
      const white = (seed & 0x7fffffff) / 2147483647 - 0.5;
      cur += NOISE_COLOR * (white - cur);
      d[i] = cur;
    }
  }
  return buf;
}

/** A dense, darkening, exponentially decaying stereo tail: a large plate/hall, normalised to unit energy. */
function reverbImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 2.6);
  const pre = Math.floor(rate * 0.02);
  const buf = ctx.createBuffer(2, len, rate);
  let seed = 98765;
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const white = seed / 4294967296 - 0.5;
      // damping: the tail loses highs as it ages
      lp += (0.75 * Math.exp(-t / 0.9) + 0.07) * (white - lp);
      const env = Math.exp((-t * Math.log(1000)) / 1.9) * Math.min(1, t / 0.012);
      d[i] = lp * env;
      energy += d[i] * d[i];
    }
  }
  const norm = 1 / Math.sqrt(energy / 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= norm;
  }
  return buf;
}

function makeEq(ctx: BaseAudioContext) {
  const bands = [biquad(ctx, "lowshelf", EQ_HZ[0], 0), biquad(ctx, "peaking", EQ_HZ[1], 0, 0.707), biquad(ctx, "highshelf", EQ_HZ[2], 0)];
  const c = chain(bands);
  return { input: c.first, output: c.last, bands };
}

export class SidFx {
  readonly input: GainNode;
  readonly output: GainNode;

  private mode: FxMode = "magic";
  private userEq: [number, number, number] = [0, 0, 0];
  private mono = true;
  private glide = 0.1; // time constant in seconds

  private realGain: GainNode;
  private fxGain: GainNode;
  private trim: GainNode;
  private lowGain: GainNode;
  private lows: BiquadFilterNode[] = [];
  private highs: BiquadFilterNode[] = [];
  private monoSel: GainNode;
  private stereoSel: GainNode;
  private side: GainNode;
  private fbA: GainNode;
  private fbB: GainNode;
  private wetA: GainNode;
  private wetB: GainNode;
  private reverbWet: GainNode;
  private fxNoise: GainNode;
  private realNoise: GainNode;
  private humGain: GainNode;
  private hum: OscillatorNode;
  private fxEq: ReturnType<typeof makeEq>;
  private realEq: ReturnType<typeof makeEq>;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.realGain = ctx.createGain();
    this.fxGain = ctx.createGain();
    this.trim = ctx.createGain();
    this.input.connect(this.realGain);
    this.input.connect(this.fxGain);

    // ----- shared FX chain: crossover -> (widen -> delay -> reverb) on the highs, bass added back -> EQ -----
    let lo: AudioNode = this.fxGain;
    let hi: AudioNode = this.fxGain;
    for (const q of LR8_Q) {
      const lp = biquad(ctx, "lowpass", SPLITTER_HZ, 0, q, true);
      const hp = biquad(ctx, "highpass", SPLITTER_HZ, 0, q, true);
      lo.connect(lp);
      hi.connect(hp);
      lo = lp;
      hi = hp;
      this.lows.push(lp);
      this.highs.push(hp);
    }
    this.lowGain = ctx.createGain();
    lo.connect(this.lowGain);

    // wide mono: side = delayed mid; L = mid + side, R = mid - side (mono compatible). Real stereo passes untouched.
    this.monoSel = ctx.createGain();
    this.stereoSel = ctx.createGain();
    hi.connect(this.monoSel);
    hi.connect(this.stereoSel);
    const midSplit = ctx.createChannelSplitter(2);
    const wideMerge = ctx.createChannelMerger(2);
    this.monoSel.connect(midSplit);
    midSplit.connect(wideMerge, 0, 0);
    midSplit.connect(wideMerge, 0, 1);
    const sideDelay = ctx.createDelay(0.1);
    sideDelay.delayTime.value = WIDE_MONO_DELAY_S;
    this.side = ctx.createGain();
    const invert = ctx.createGain();
    invert.gain.value = -1;
    midSplit.connect(sideDelay, 0);
    sideDelay.connect(this.side);
    this.side.connect(wideMerge, 0, 0);
    this.side.connect(invert);
    invert.connect(wideMerge, 0, 1);
    const wideOut = ctx.createGain();
    wideMerge.connect(wideOut);
    this.stereoSel.connect(wideOut);

    // ping-pong delay, send style: echoes are added on top of the dry signal
    const ppSplit = ctx.createChannelSplitter(2);
    const ppMerge = ctx.createChannelMerger(2);
    wideOut.connect(ppSplit);
    const dA = ctx.createDelay(1.5);
    const dB = ctx.createDelay(1.5);
    dA.delayTime.value = PING_PONG_S;
    dB.delayTime.value = PING_PONG_S;
    this.fbA = ctx.createGain();
    this.fbB = ctx.createGain();
    this.wetA = ctx.createGain();
    this.wetB = ctx.createGain();
    ppSplit.connect(dA, 0);
    ppSplit.connect(dB, 1);
    dB.connect(this.fbA).connect(dA);
    dA.connect(this.fbB).connect(dB);
    dB.connect(this.wetA).connect(ppMerge, 0, 0);
    dA.connect(this.wetB).connect(ppMerge, 0, 1);
    ppSplit.connect(ppMerge, 0, 0);
    ppSplit.connect(ppMerge, 1, 1);

    // reverb send
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = reverbImpulse(ctx);
    this.reverbWet = ctx.createGain();
    const mix = ctx.createGain();
    ppMerge.connect(conv).connect(this.reverbWet).connect(mix);
    ppMerge.connect(mix);

    this.fxEq = makeEq(ctx);
    mix.connect(this.fxEq.input);
    this.lowGain.connect(this.fxEq.input);
    const fxPost = ctx.createGain();
    this.fxEq.output.connect(fxPost);
    const noiseBuf = noiseBuffer(ctx, 4);
    this.fxNoise = this.noiseSource(noiseBuf, fxPost);
    fxPost.connect(this.trim);

    // ----- REAL chain: mains hum + cheap speaker EQ + tanh distortion + hiss -----
    const speakerIn = ctx.createGain();
    this.realGain.connect(speakerIn);
    this.humGain = ctx.createGain();
    this.hum = ctx.createOscillator();
    const real = new Float32Array(HUM_HARMONICS + 1);
    const amps: number[] = [];
    let sumSq = 0;
    const decay = 2 + (0.7 - 2) * 0.62;
    for (let n = 1; n <= HUM_HARMONICS; n++) {
      let a = n ** -decay;
      if (n === 1) a *= 0.6;
      else if (n & 1) a *= 0.5;
      amps.push(a);
      sumSq += a * a;
    }
    const norm = 1 / Math.sqrt(sumSq / 2);
    amps.forEach((a, i) => (real[i + 1] = a * norm));
    this.hum.setPeriodicWave(ctx.createPeriodicWave(real, new Float32Array(real.length)));
    this.hum.frequency.value = 50;
    this.hum.connect(this.humGain).connect(speakerIn);
    this.hum.start();

    const sp = chain([
      speakerIn,
      biquad(ctx, "highpass", 180, 0, 1.5, true),
      biquad(ctx, "highpass", 180, 0, 1.5, true),
      biquad(ctx, "peaking", 125, -7, 1.41),
      biquad(ctx, "peaking", 250, 5, 1.41),
      biquad(ctx, "peaking", 500, -7, 1.41),
      biquad(ctx, "peaking", 1000, 10, 1.41),
      biquad(ctx, "peaking", 2000, -5, 1.41),
      biquad(ctx, "peaking", 4000, 14, 1.41),
      biquad(ctx, "peaking", 8000, -7, 1.41),
      biquad(ctx, "lowpass", 16000, 0, 1.0, true),
    ]);
    // tanh(x * drive) / drive over the shaper's -1..+1 input range: the speaker's resonance peaks overdrive first
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = i / 2048 - 1;
      curve[i] = Math.tanh(x * REAL_DISTORTION) / REAL_DISTORTION;
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    const postShape = ctx.createGain();
    sp.last.connect(shaper).connect(postShape);
    this.realEq = makeEq(ctx);
    postShape.connect(this.realEq.input);
    const realPost = ctx.createGain();
    this.realEq.output.connect(realPost);
    this.realNoise = this.noiseSource(noiseBuf, realPost);
    realPost.connect(this.trim);

    this.trim.connect(this.output);
    this.apply(true);
  }

  private noiseSource(buf: AudioBuffer, dest: AudioNode): GainNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(dest);
    src.start();
    return g;
  }

  /** Set a parameter, gliding unless `immediate`. */
  private set(p: AudioParam, v: number, immediate: boolean) {
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    if (immediate) p.setValueAtTime(v, t);
    else p.setTargetAtTime(v, t, this.glide);
  }

  private apply(immediate: boolean) {
    const m = MODES[this.mode];
    const fxOn = !m.real && this.mode !== "pure";
    this.set(this.realGain.gain, m.real ? 1 : 0, immediate);
    this.set(this.fxGain.gain, m.real ? 0 : 1, immediate);

    const freq = fxOn ? SPLITTER_HZ : SPLITTER_PARK_HZ;
    for (const f of [...this.lows, ...this.highs]) this.set(f.frequency, freq, immediate);
    this.set(this.lowGain.gain, dbToLin(fxOn ? SPLITTER_LOW_GAIN_DB + m.extraLowDb : 0), immediate);

    this.set(this.side.gain, fxOn ? m.width : 0, immediate);
    const fb = m.delayFeedback ** 2;
    this.set(this.fbA.gain, fb, immediate);
    this.set(this.fbB.gain, fb, immediate);
    const wet = fxOn ? m.delayWet ** 2 : 0;
    this.set(this.wetA.gain, wet, immediate);
    this.set(this.wetB.gain, wet, immediate);
    this.set(this.reverbWet.gain, fxOn ? m.reverbWet ** 2 : 0, immediate);
    this.set(this.fxNoise.gain, fxOn ? FX_NOISE : 0, immediate);
    this.set(this.realNoise.gain, m.real ? REAL_NOISE : 0, immediate);
    this.set(this.humGain.gain, m.real ? REAL_HUM : 0, immediate);
    this.set(this.monoSel.gain, this.mono ? 1 : 0, true);
    this.set(this.stereoSel.gain, this.mono ? 0 : 1, true);

    for (let b = 0; b < 3; b++) {
      this.set(this.fxEq.bands[b].gain, m.eqDb[b] + this.userEq[b], immediate);
      this.set(this.realEq.bands[b].gain, this.userEq[b], immediate);
    }
    this.set(this.trim.gain, dbToLin(m.trimDb), immediate);
  }

  setMode(mode: FxMode, immediate = false) {
    this.mode = mode;
    this.apply(immediate);
  }

  setEq(eq: [number, number, number], immediate = false) {
    this.userEq = eq;
    this.apply(immediate);
  }

  /** A single SID chip is mono and gets widened; multi-chip tunes already have a stereo image. */
  setMono(mono: boolean) {
    this.mono = mono;
    this.apply(true);
  }

  /** Mains hum frequency of the machine the tune was written for. */
  setMains(hz: 50 | 60) {
    this.hum.frequency.setValueAtTime(hz, this.ctx.currentTime);
  }

  setGlideSeconds(seconds: number) {
    this.glide = Math.max(0.01, seconds / 3);
  }
}
