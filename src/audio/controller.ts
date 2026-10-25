import type { EngineSettings, FromWorker, LevelMessage, ToWorker, TuneDetails } from "./protocol";

export interface RomSet {
  kernal?: Uint8Array;
  basic?: Uint8Array;
  chargen?: Uint8Array;
}

interface Meta {
  frame: number;
  regs: Uint8Array[];
}

/** Owns the AudioContext, the SID render worker and the worklet that connects them. */
export class AudioController {
  ctx!: AudioContext;
  analyser!: AnalyserNode;
  private gain!: GainNode;
  private node!: AudioWorkletNode;
  private worker!: Worker;
  private ready: Promise<void> | null = null;

  private gen = 0;
  private baseSec = 0;
  private playedFrames = 0;
  private metas: Meta[] = [];
  private eofFrame: number | null = null;
  private exportWaiters = new Map<number, (wav: ArrayBuffer | null) => void>();
  private exportId = 0;

  onLoaded: (info: TuneDetails) => void = () => {};
  onSeeked: () => void = () => {};
  onError: (message: string) => void = () => {};

  /** Safe to call repeatedly; must first run inside a user gesture. */
  init(settings: EngineSettings, roms: RomSet, volume: number): Promise<void> {
    return (this.ready ??= this.setup(settings, roms, volume));
  }

  private async setup(settings: EngineSettings, roms: RomSet, volume: number) {
    this.ctx = new AudioContext({ latencyHint: "playback" });
    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}sid-worklet.js`);
    this.node = new AudioWorkletNode(this.ctx, "sid-processor", { outputChannelCount: [2] });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.node.connect(this.gain).connect(this.analyser);
    this.gain.connect(this.ctx.destination);

    this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const channel = new MessageChannel();
    this.node.port.postMessage({ type: "data-port", port: channel.port1 }, [channel.port1]);
    this.send({ type: "port", port: channel.port2 }, [channel.port2]);
    this.node.port.onmessage = (e: MessageEvent<LevelMessage>) => {
      if (e.data.gen === this.gen) this.playedFrames = e.data.played;
    };
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.fromWorker(e.data);
    this.send({ type: "init", sampleRate: this.ctx.sampleRate, settings, roms });
  }

  private send(m: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(m, transfer);
  }

  private fromWorker(m: FromWorker) {
    switch (m.type) {
      case "meta":
        if (m.gen === this.gen) {
          this.metas.push({ frame: m.frame, regs: m.regs });
          if (this.metas.length > 400) this.metas.splice(0, this.metas.length - 300);
        }
        break;
      case "eof":
        if (m.gen === this.gen) this.eofFrame = m.frame;
        break;
      case "loaded":
        if (m.gen === this.gen) this.onLoaded(m.info);
        break;
      case "seeked":
        if (m.gen === this.gen) this.onSeeked();
        break;
      case "error":
        if (m.gen === this.gen) this.onError(m.message);
        break;
      case "exported":
        this.exportWaiters.get(m.id)?.(m.wav);
        this.exportWaiters.delete(m.id);
        break;
    }
  }

  private newGeneration(startAt: number) {
    this.gen++;
    this.baseSec = startAt;
    this.playedFrames = 0;
    this.metas = [];
    this.eofFrame = null;
    this.node.port.postMessage({ type: "flush", gen: this.gen });
  }

  load(data: ArrayBuffer, song: number, startAt = 0) {
    this.newGeneration(startAt);
    this.send({ type: "load", gen: this.gen, data: data.slice(0), song, startAt });
  }

  seek(seconds: number) {
    this.newGeneration(seconds);
    this.send({ type: "seek", gen: this.gen, seconds });
  }

  async setPaused(paused: boolean) {
    if (!this.ready) return;
    this.send({ type: "pause", paused });
    if (paused) await this.ctx.suspend();
    else await this.ctx.resume();
  }

  /** Starts audio after a load; also wakes the worker if an earlier pause left it idle. */
  resume() {
    this.send({ type: "pause", paused: false });
    return this.ctx.resume();
  }

  setVolume(v: number) {
    if (this.gain) this.gain.gain.value = v;
  }

  setMute(voice: number, muted: boolean) {
    this.send({ type: "mute", voice, muted });
  }

  applySettings(s: EngineSettings) {
    if (this.ready) this.send({ type: "settings", settings: s });
  }

  position(): number {
    return this.ready ? this.baseSec + this.playedFrames / this.ctx.sampleRate : 0;
  }

  /** True once the engine reported the end of the tune and playback caught up. */
  hasEnded(): boolean {
    return this.eofFrame !== null && this.playedFrames >= this.eofFrame;
  }

  /** SID register snapshots (one per chip) matching what is audible now. */
  currentRegs(): Uint8Array[] | null {
    const f = this.playedFrames;
    let found: Meta | null = null;
    for (let i = this.metas.length - 1; i >= 0; i--) {
      if (this.metas[i].frame <= f) {
        found = this.metas[i];
        break;
      }
    }
    return found?.regs ?? null;
  }

  exportWav(data: ArrayBuffer, song: number, seconds: number): Promise<ArrayBuffer | null> {
    const id = ++this.exportId;
    return new Promise((resolve) => {
      this.exportWaiters.set(id, resolve);
      this.send({ type: "export", id, data: data.slice(0), song, seconds });
    });
  }
}
