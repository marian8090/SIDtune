# SIDtune

A browser-based player for [HVSC](https://www.hvsc.c64.org/) (the High Voltage SID Collection) and other Commodore 64 `.sid` music.
Inspired by [ultraSID](https://ultrasid.com/) by Toddler-Boy. SIDtune is an independent project and is not affiliated with it.

Everything runs locally in your browser: the C64 + SID emulation (libsidplayfp compiled to WebAssembly), your library, playlists and
favorites. Nothing is uploaded, and no music is bundled.

## Features

- Accurate SID playback with a choice of **reSIDfp** (reference accuracy) or **SIDLite** (light enough for phones)
- Import an unpacked HVSC folder (drag it onto the page, or use *Add folder*), loose `.sid` files, or a `.zip`
- Instant search by title, composer, year or path across the whole collection; sortable, virtualised list
- Playlists, favorites, history; the queue follows the list you started from; shuffle and repeat
- Song lengths from `Songlengths.md5`, STIL notes from `STIL.txt` (both picked up automatically from an imported HVSC folder)
- Seek anywhere in a tune, subtunes, per-voice muting
- Now-playing view with a live pitch roll for every voice of every SID chip, plus a scope
- SID chip (6581/8580) and PAL/NTSC overrides, digi boost
- Export the current tune to WAV
- Media-key and lock-screen controls (Media Session API)
- Responsive layout for desktop and mobile

Keyboard: `Space` play/pause, `←`/`→` seek ±10 s, `Shift+←`/`Shift+→` previous/next, `/` search, `Esc` close panel.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (relative paths, host anywhere)
```

Then download HVSC, unpack it, and drop its `C64Music` folder on the page. Include `DOCUMENTS/Songlengths.md5` and `DOCUMENTS/STIL.txt`
(they are inside that folder) to get track lengths and notes. A few tunes (RSID / BASIC driven) need the C64 KERNAL, BASIC and CHARGEN ROMs;
add your own copies under *Settings → C64 ROMs*.

## How it works

```
main thread                 worker                      audio thread
-----------                 ------                      ------------
UI + library (IndexedDB) -> engine.worker.ts  -------->  sid-worklet.js
AudioController              libsidplayfp WASM  PCM       plays chunks,
                             renders ~0.35 s ahead        reports position
```

- `src/audio/engine.worker.ts` renders PCM in 1024-frame chunks and snapshots the SID registers with each chunk, so the visualiser stays in
  sync with what you hear.
- `public/sid-worklet.js` is an `AudioWorkletProcessor` fed over a `MessageChannel` straight from the worker.
- `src/state.ts` holds all app state (Preact signals); `src/lib/` has the PSID parser, IndexedDB layer and importers.

## Known limitations and ideas

- Seeking runs the emulator up to the target. Forward seeks cost the distance travelled, backward seeks restart the tune. reSIDfp
  fast-forwards at roughly 7× realtime in this path, so a seek far into a long tune can take several seconds (a spinner is shown).
  SIDLite is much faster.
- Export is WAV only (no FLAC/OGG yet), and the engine is stock libsidplayfp rather than ultraSID's libSidplayEZ fork.
- No C64 title screens, screenshots or portraits, and no CRT view.
- The iOS app is not started. The audio engine and UI logic are reusable; a native shell (SwiftUI plus the same emulation core) or a
  Capacitor wrapper are the likely routes.

## Licence

GPL-3.0-or-later, see [LICENSE](LICENSE). Emulation is [libsidplayfp](https://github.com/libsidplayfp/libsidplayfp) / reSIDfp
(GPL-2.0-or-later) via the [`libsidplayfp-wasm`](https://github.com/chrisgleissner/libsidplayfp-wasm) package. Its third-party notices and
corresponding source ship in `node_modules/libsidplayfp-wasm` and must be kept with any distributed build. The SID/C64 music belongs to its
composers, and HVSC has its own terms.
