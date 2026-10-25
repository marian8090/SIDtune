import { useRef } from "preact/hooks";
import { parseSonglengths } from "../lib/songlengths";
import { kvSet } from "../lib/db";
import { parseStil } from "../lib/stil";
import { connectHvsc, hvscAvailable, hvscStatus, localTunes, message, roms, saveRoms, settings, settingsOpen, songlengths, stil, updateSettings, wipeLibrary } from "../state";
import { Close } from "./Icons";

async function readBytes(f: File | undefined) {
  return f ? new Uint8Array(await f.arrayBuffer()) : undefined;
}

export function SettingsDialog() {
  if (!settingsOpen.value) return null;
  const s = settings.value;
  const rom = useRef<{ kernal?: File; basic?: File; chargen?: File }>({});
  const r = roms.value;

  const loadText = async (f: File | undefined, kind: "songlengths" | "stil") => {
    if (!f) return;
    const text = await f.text();
    await kvSet(kind, text);
    if (kind === "songlengths") songlengths.value = parseSonglengths(text);
    else stil.value = parseStil(text);
    message.value = kind === "songlengths" ? "Song lengths loaded." : "STIL notes loaded.";
  };

  return (
    <div class="overlay" onClick={() => (settingsOpen.value = false)}>
      <div class="dialog" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button class="icon-btn" onClick={() => (settingsOpen.value = false)} aria-label="Close">
            <Close />
          </button>
        </header>

        <h4>Sound</h4>
        <label class="field">
          <span>
            Emulation engine
            <small>reSIDfp is the accurate reference. SIDLite is much lighter on slow phones.</small>
          </span>
          <select class="input" value={s.engine} onChange={(e) => updateSettings({ engine: (e.currentTarget as HTMLSelectElement).value as typeof s.engine })}>
            <option value="residfp">reSIDfp (accurate)</option>
            <option value="sidlite">SIDLite (fast)</option>
          </select>
        </label>
        <label class="field">
          <span>
            SID chip
            <small>Auto uses what the tune asks for. 6581 is the classic C64, 8580 the later revision.</small>
          </span>
          <select class="input" value={s.sidModel} onChange={(e) => updateSettings({ sidModel: (e.currentTarget as HTMLSelectElement).value as typeof s.sidModel })}>
            <option value="auto">Auto</option>
            <option value="MOS6581">Force 6581</option>
            <option value="MOS8580">Force 8580</option>
          </select>
        </label>
        <label class="field">
          <span>
            Machine clock
            <small>PAL or NTSC changes tempo and pitch.</small>
          </span>
          <select class="input" value={s.c64Model} onChange={(e) => updateSettings({ c64Model: (e.currentTarget as HTMLSelectElement).value as typeof s.c64Model })}>
            <option value="auto">Auto</option>
            <option value="PAL">Force PAL</option>
            <option value="NTSC">Force NTSC</option>
          </select>
        </label>
        <label class="field">
          <span>
            Digi boost
            <small>Louder sample playback on the 8580.</small>
          </span>
          <input type="checkbox" checked={s.digiBoost} onChange={(e) => updateSettings({ digiBoost: (e.currentTarget as HTMLInputElement).checked })} />
        </label>
        <label class="field">
          <span>
            Instant seeking
            <small>
              Renders each tune into memory in the background so seeking is immediate. Uses a second CPU thread and about 11 MB of memory per
              minute of music (tunes up to 10 minutes, 5 on phones). Turn off to save memory and battery; seeks then take a few seconds.
            </small>
          </span>
          <input type="checkbox" checked={s.seekCache} onChange={(e) => updateSettings({ seekCache: (e.currentTarget as HTMLInputElement).checked })} />
        </label>
        <label class="field">
          <span>
            Default length (seconds)
            <small>Used when a tune is not in the song-length database.</small>
          </span>
          <input
            type="number"
            class="input num"
            min={10}
            max={3600}
            value={s.defaultLengthSec}
            onChange={(e) => updateSettings({ defaultLengthSec: Math.max(10, Number((e.currentTarget as HTMLInputElement).value) || 180) })}
          />
        </label>

        {hvscAvailable && (
          <>
            <h4>Online HVSC</h4>
            <label class="field">
              <span>
                Browse the HVSC catalogue
                <small>
                  {hvscStatus.value.text || "Searchable list of the whole collection; tunes download as you play them."}
                </small>
              </span>
              <input
                type="checkbox"
                checked={s.hvsc}
                onChange={(e) => {
                  updateSettings({ hvsc: (e.currentTarget as HTMLInputElement).checked });
                  void connectHvsc();
                }}
              />
            </label>
            {s.hvsc && (
              <div class="field">
                <span>
                  Check for a new release
                  <small>The catalogue also refreshes itself whenever you open the app.</small>
                </span>
                <button class="btn" onClick={() => void connectHvsc(true)}>Refresh</button>
              </div>
            )}
          </>
        )}

        <h4>Collection data</h4>
        <div class="field">
          <span>
            Song lengths
            <small>HVSC’s <code>DOCUMENTS/Songlengths.md5</code> {songlengths.value ? `(${songlengths.value.db.size.toLocaleString()} tunes loaded)` : "(not loaded)"}</small>
          </span>
          <input type="file" accept=".md5,.txt" onChange={(e) => void loadText((e.currentTarget as HTMLInputElement).files?.[0], "songlengths")} />
        </div>
        <div class="field">
          <span>
            STIL notes
            <small>HVSC’s <code>DOCUMENTS/STIL.txt</code> {stil.value.size ? `(${stil.value.size.toLocaleString()} entries)` : "(not loaded)"}</small>
          </span>
          <input type="file" accept=".txt" onChange={(e) => void loadText((e.currentTarget as HTMLInputElement).files?.[0], "stil")} />
        </div>

        <h4>C64 ROMs <small>(optional)</small></h4>
        <p class="hint">
          A minority of tunes (RSID, BASIC-driven) need the C64’s own ROMs to run. They are copyrighted, so SIDtune cannot include them. If you own
          legitimate copies, add the three images and reload the page. {r.kernal && r.basic && r.chargen ? "ROMs are currently stored." : ""}
        </p>
        <div class="roms">
          {(["kernal", "basic", "chargen"] as const).map((k) => (
            <label key={k}>
              <small>{k.toUpperCase()} {k === "chargen" ? "(4 KiB)" : "(8 KiB)"} {r[k] ? "✓" : ""}</small>
              <input type="file" onChange={(e) => (rom.current[k] = (e.currentTarget as HTMLInputElement).files?.[0])} />
            </label>
          ))}
          <button
            class="btn"
            onClick={async () => {
              const [kernal, basic, chargen] = await Promise.all([readBytes(rom.current.kernal ?? undefined), readBytes(rom.current.basic ?? undefined), readBytes(rom.current.chargen ?? undefined)]);
              if ((kernal && kernal.length !== 8192) || (basic && basic.length !== 8192) || (chargen && chargen.length !== 4096)) {
                message.value = "ROM sizes must be KERNAL 8192, BASIC 8192, CHARGEN 4096 bytes.";
                return;
              }
              await saveRoms({ kernal: kernal ?? r.kernal, basic: basic ?? r.basic, chargen: chargen ?? r.chargen });
            }}
          >
            Save ROMs
          </button>
        </div>

        <h4>Library</h4>
        <div class="field">
          <span>
            {localTunes.value.length.toLocaleString()} imported tunes stored in this browser
            <small>Removes imported tunes, song lengths and STIL. Favorites and playlists are kept.</small>
          </span>
          <button class="btn danger" onClick={() => confirm("Remove all imported tunes from this browser?") && void wipeLibrary()}>
            Clear library
          </button>
        </div>
        <p class="hint about">
          SIDtune is free software (GPL-3.0), inspired by <a href="https://ultrasid.com/" target="_blank" rel="noreferrer">ultraSID</a>. Emulation by
          libsidplayfp / reSIDfp.
        </p>
      </div>
    </div>
  );
}
