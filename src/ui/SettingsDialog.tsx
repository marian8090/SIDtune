import { useEffect, useRef, useState } from "preact/hooks";
import { font, FONTS, showWelcome, theme, THEMES, tooltips, type FontId, type ThemeId } from "../lib/prefs";
import { parseSonglengths } from "../lib/songlengths";
import { kvSet } from "../lib/db";
import { parseStil } from "../lib/stil";
import { SEEK_CACHE_MAX_SEC } from "../lib/types";
import { aboutOpen, collectionDownload, collectionMissingBytes, connectHvsc, docOpen, downloadCollection, stopCollectionDownload, exportBackup, favorites, playlists, restoreBackup, storagePersisted, hvscAvailable, hvscStatus, localTunes, message, roms, saveRoms, settings, settingsOpen, songlengths, stil, updateSettings, wipeLibrary } from "../state";
import { confirmDialog } from "./Ask";
import { Close } from "./Icons";

const mb = (bytes: number) => `${Math.round(bytes / 1048576).toLocaleString()} MB`;

function CollectionDownload() {
  const dl = collectionDownload.value;
  const [missing, setMissing] = useState<number | null>(null);
  useEffect(() => {
    if (!dl) void collectionMissingBytes().then(setMissing);
  }, [dl, hvscStatus.value.text]);
  if (hvscStatus.value.state !== "ready") return null;
  return (
    <div class="field">
      <span>
        Download the whole collection
        <small>
          {dl
            ? `${mb(dl.done)} of ${mb(dl.total)}. You can keep listening meanwhile.`
            : missing === 0
              ? "Every tune is stored in this browser and plays offline."
              : `Stores every tune in this browser so the whole HVSC plays offline${missing ? ` (about ${mb(missing)} to download)` : ""}. Otherwise tunes download as you play them.`}
        </small>
        {dl && (
          <div class="progress">
            <div style={{ width: `${(100 * dl.done) / dl.total}%` }} />
            <span>{Math.floor((100 * dl.done) / dl.total)}%</span>
          </div>
        )}
      </span>
      {dl ? (
        <button class="btn" onClick={stopCollectionDownload}>Stop</button>
      ) : (
        <button
          class="btn"
          disabled={missing === 0}
          onClick={async () => {
            const est = await navigator.storage?.estimate?.();
            const free = est?.quota !== undefined && est.usage !== undefined ? est.quota - est.usage : undefined;
            const room = free !== undefined && missing !== null && free < missing * 1.1 ? ` This browser reports only ${mb(free)} free for SIDtune, so it may stop part-way.` : "";
            if (await confirmDialog("Download the whole collection?", { text: `About ${mb(missing ?? 0)} will be downloaded and stored in this browser.${room}`, ok: "Download" }))
              void downloadCollection();
          }}
        >
          Download
        </button>
      )}
    </div>
  );
}

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

        <h4>Appearance</h4>
        <label class="field">
          <span>
            Theme
            <small>Press T to cycle through them.</small>
          </span>
          <select class="input" value={theme.value} onChange={(e) => (theme.value = (e.currentTarget as HTMLSelectElement).value as ThemeId)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>
            Font
            <small>The lettering used throughout SIDtune.</small>
          </span>
          <select class="input" value={font.value} onChange={(e) => (font.value = (e.currentTarget as HTMLSelectElement).value as FontId)}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>
            Tooltips
            <small>Short explanations when you hover over a button.</small>
          </span>
          <input type="checkbox" checked={tooltips.value} onChange={(e) => (tooltips.value = (e.currentTarget as HTMLInputElement).checked)} />
        </label>
        <label class="field">
          <span>
            Welcome on startup
            <small>Show the About window each time SIDtune opens.</small>
          </span>
          <input type="checkbox" checked={showWelcome.value} onChange={(e) => (showWelcome.value = (e.currentTarget as HTMLInputElement).checked)} />
        </label>

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
              Renders each tune into memory in the background so seeking is immediate; once it has caught up, playback comes from memory.
              Uses about 11 MB of memory per minute of music. Turn off to save memory; seeks then take a few seconds.
            </small>
          </span>
          <input type="checkbox" checked={s.seekCache} onChange={(e) => updateSettings({ seekCache: (e.currentTarget as HTMLInputElement).checked })} />
        </label>
        <label class="field">
          <span>
            Pre-render long tunes
            <small>
              Renders tunes longer than {SEEK_CACHE_MAX_SEC / 60} minutes in full as well (a 30-minute tune needs about 330 MB). Turn off to keep
              only the part you have heard of those, which saves memory on phones.
            </small>
          </span>
          <input
            type="checkbox"
            checked={s.prerenderLong}
            disabled={!s.seekCache}
            onChange={(e) => updateSettings({ prerenderLong: (e.currentTarget as HTMLInputElement).checked })}
          />
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
            {s.hvsc && <CollectionDownload />}
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

        <h4>Backup</h4>
        <div class="field">
          <span>
            Save a backup
            <small>
              {favorites.value.length.toLocaleString()} favorites and {playlists.value.length} playlists, plus history and settings, as a file. Keep it
              to move to another browser or device, or in case this browser clears its data.
              {storagePersisted.value ? " This browser has agreed to keep SIDtune’s data." : ""}
            </small>
          </span>
          <button class="btn" onClick={exportBackup}>Save backup</button>
        </div>
        <div class="field">
          <span>
            Restore a backup
            <small>Replaces your current favorites, playlists, history and settings with the ones in the file.</small>
          </span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const input = e.currentTarget as HTMLInputElement;
              const f = input.files?.[0];
              input.value = "";
              if (f && (await confirmDialog("Restore this backup?", { text: "Your current favorites, playlists, history and settings are replaced.", ok: "Restore" })))
                await restoreBackup(f);
            }}
          />
        </div>

        <h4>Library</h4>
        <div class="field">
          <span>
            {localTunes.value.length.toLocaleString()} imported tunes stored in this browser
            <small>Removes imported tunes, tunes stored from the online catalogue, song lengths and STIL. Favorites and playlists are kept.</small>
          </span>
          <button class="btn danger" onClick={async () => (await confirmDialog("Clear the library?", { text: "Removes all imported tunes and tunes stored from the online catalogue. Favorites and playlists are kept.", ok: "Clear library", danger: true })) && void wipeLibrary()}>
            Clear library
          </button>
        </div>
        <p class="hint about">
          SIDtune {__APP_VERSION__} ·{" "}
          <button class="link" onClick={() => ((settingsOpen.value = false), (aboutOpen.value = true))}>
            About
          </button>{" "}
          ·{" "}
          <button class="link" onClick={() => ((settingsOpen.value = false), (docOpen.value = "manual"))}>
            Help
          </button>
        </p>
      </div>
    </div>
  );
}
