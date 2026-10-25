// Plays interleaved stereo Float32 chunks pushed by the render worker over a MessagePort.
class SidProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.cur = null;
    this.off = 0;
    this.gen = 0;
    this.played = 0;
    this.sinceReport = 0;
    this.data = null;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "data-port") {
        this.data = m.port;
        this.data.onmessage = (ev) => {
          const c = ev.data;
          if (c.gen === this.gen) this.queue.push(c.pcm);
        };
      } else if (m.type === "flush") {
        this.gen = m.gen;
        this.queue = [];
        this.cur = null;
        this.off = 0;
        this.played = 0;
        this.report();
      }
    };
  }

  report() {
    const msg = { type: "level", gen: this.gen, played: this.played };
    this.port.postMessage(msg);
    if (this.data) this.data.postMessage(msg);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
    for (let i = 0; i < l.length; i++) {
      if (!this.cur || this.off >= this.cur.length) {
        this.cur = this.queue.shift() || null;
        this.off = 0;
      }
      if (!this.cur) {
        l[i] = 0;
        r[i] = 0;
        continue;
      }
      l[i] = this.cur[this.off++];
      r[i] = this.cur[this.off++];
      this.played++;
    }
    this.sinceReport += l.length;
    if (this.sinceReport >= 1024) {
      this.sinceReport = 0;
      this.report();
    }
    return true;
  }
}
registerProcessor("sid-processor", SidProcessor);
