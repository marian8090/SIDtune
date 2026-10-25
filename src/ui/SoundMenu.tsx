import { useEffect } from "preact/hooks";
import { FX_MODES } from "../audio/fx";
import { settings, soundMenuOpen, updateSettings } from "../state";
import { Close } from "./Icons";

const BANDS = ["Low · 200 Hz", "Mid · 1 kHz", "High · 4 kHz"];

export function SoundButton() {
  const mode = FX_MODES.find((m) => m.id === settings.value.fxMode)!;
  return (
    <button
      class={`sound-btn ${soundMenuOpen.value ? "on" : ""}`}
      title="Audio quality (Ctrl+E)"
      aria-expanded={soundMenuOpen.value}
      onClick={(e) => {
        e.stopPropagation();
        soundMenuOpen.value = !soundMenuOpen.value;
      }}
    >
      {mode.label}
    </button>
  );
}

export function SoundMenu() {
  useEffect(() => {
    if (!soundMenuOpen.value) return;
    const close = () => (soundMenuOpen.value = false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [soundMenuOpen.value]);
  if (!soundMenuOpen.value) return null;

  const s = settings.value;
  const flat = s.eq.every((v) => v === 0);

  return (
    <div class="sound-menu" role="dialog" aria-label="Audio quality" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Audio quality</h2>
        <button class="icon-btn" onClick={() => (soundMenuOpen.value = false)} aria-label="Close">
          <Close />
        </button>
      </header>
      <div class="modes" role="radiogroup">
        {FX_MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={s.fxMode === m.id} class={`mode ${s.fxMode === m.id ? "on" : ""}`} onClick={() => updateSettings({ fxMode: m.id })}>
            <b>{m.label}</b>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>
      <div class="eq-head">
        <h3>Equalizer</h3>
        <button class="link" disabled={flat} onClick={() => updateSettings({ eq: [0, 0, 0] })}>
          Reset
        </button>
      </div>
      {BANDS.map((label, i) => (
        <label class="eq-row" key={label}>
          <span>{label}</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={s.eq[i]}
            aria-label={`${label} gain`}
            style={{ "--p": `${((s.eq[i] + 12) / 24) * 100}%` }}
            onInput={(e) => {
              const eq = [...s.eq] as [number, number, number];
              eq[i] = Number((e.currentTarget as HTMLInputElement).value);
              updateSettings({ eq });
            }}
            onDblClick={() => {
              const eq = [...s.eq] as [number, number, number];
              eq[i] = 0;
              updateSettings({ eq });
            }}
          />
          <em>{s.eq[i] > 0 ? "+" : ""}{s.eq[i]} dB</em>
        </label>
      ))}
    </div>
  );
}
