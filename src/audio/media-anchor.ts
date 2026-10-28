// Browsers hand the system media controls (media keys, lock screen, Control Center, headset buttons) only to pages that play
// through an <audio>/<video> element; Web Audio alone does not count. A looping silent element runs alongside the tune to
// claim them. Its first play() must happen inside a user gesture (iOS), later ones need not.

let el: HTMLAudioElement | null = null;
let wanted = false;

/** 10 s of 8 kHz 8-bit mono silence; Chrome ignores media shorter than 5 s. */
function silence(): string {
  const n = 8000 * 10;
  const b = new Uint8Array(44 + n).fill(128);
  const dv = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + n, true);
  w(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  w(36, "data");
  dv.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

let onSystemPause: () => void = () => {};

/** `f` runs when the system pauses the element on its own (another app took the audio focus, a call came in). */
export function setOnSystemPause(f: () => void) {
  onSystemPause = f;
}

export function anchorMedia(on: boolean) {
  wanted = on;
  if (!on) {
    el?.pause();
    return;
  }
  if (!el) {
    el = new Audio(silence());
    el.loop = true;
    // pause events arrive late: one from our own pause() can land after the next play()
    el.addEventListener("pause", () => wanted && el!.paused && onSystemPause());
  }
  if (el.paused) void el.play().catch(() => {});
}
