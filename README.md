# SIDtune

A browser-based player for [HVSC](https://www.hvsc.c64.org/) (the High Voltage SID Collection) and other Commodore 64 `.sid` music.
Inspired by [ultraSID](https://ultrasid.com/) by Toddler-Boy. SIDtune is an independent project and is not affiliated with it.

Everything runs locally in your browser: the C64 + SID emulation (libsidplayfp compiled to WebAssembly), your library, playlists and
favorites. Nothing is uploaded, and no music is bundled.

## Features

- Accurate SID playback with a choice of **reSIDfp** (reference accuracy) or **SIDLite** (light enough for phones)
- Optional online HVSC catalogue: the whole collection is searchable at once and tunes stream as you play them (see [docs/HVSC-HOSTING.md](docs/HVSC-HOSTING.md), including the copyright note)
- Import an unpacked HVSC folder (drag it onto the page, or use *Add folder*), loose `.sid` files, or a `.zip`
- Instant search by title, composer, year or path across the whole collection; sortable, virtualised list
- Playlists, favorites, history; the queue follows the list you started from; shuffle and repeat
- Song lengths from `Songlengths.md5`, STIL notes from `STIL.txt` (both picked up automatically from an imported HVSC folder)
- Instant seeking: tunes are rendered into memory by a background worker (can be switched off in Settings), subtunes, per-voice muting
- Now-playing view with a live pitch roll for every voice of every SID chip, plus a scope
- Audio quality modes modelled on ultraSID: Real (cheap TV speaker), Pure, Magic (default), Epic and Mythic, plus a 3-band equalizer (button next to the volume, `Ctrl+E`)
- SID chip (6581/8580) and PAL/NTSC overrides, digi boost
- Download the original SID file, or render the tune to FLAC, WAV or MP3 (tagged with title, composer and year)
- Six themes: SIDtune Purple, C64 Blue, Green and Amber Phosphor, Monochrome dark and light, and a choice of font
- Shareable links that open a tune (and subtune) directly
- Built-in manual (`?`) and version history ([CHANGELOG.md](CHANGELOG.md))
- Media-key and lock-screen controls (Media Session API)
- Responsive layout for desktop and mobile

Keyboard: `Space` play/pause, `←`/`→` seek ±10 s, `Shift+←`/`Shift+→` previous/next, `1`–`9` subtune, `/` search, `T` theme, `?` help.
The full list is in the [manual](docs/MANUAL.md).

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

- `src/audio/cache.worker.ts` pre-renders the whole tune on a second thread; `engine.worker.ts` streams from that cache after a seek.
- `src/audio/engine.worker.ts` renders PCM in 1024-frame chunks and snapshots the SID registers with each chunk, so the visualiser stays in
  sync with what you hear.
- `public/sid-worklet.js` is an `AudioWorkletProcessor` fed over a `MessageChannel` straight from the worker.
- `src/state.ts` holds all app state (Preact signals); `src/lib/` has the PSID parser, IndexedDB layer and importers.

## Known limitations and ideas

- Seeking is instant once the background render has caught up (about 7x realtime on reSIDfp, so a few seconds after a tune starts, longer
  for long tunes). Seeking ahead of that, muting a voice after a seek, or turning Instant seeking off falls back to running the emulator up
  to the target, which shows a spinner. The cache costs about 11 MB per minute of music. Tunes longer than 10 minutes (5 on touch
  devices) are rendered in full too unless *Pre-render long tunes* is off; then only the part already played is kept.
- The audio quality modes use ultraSID's parameter values but a Web Audio reverb (synthetic impulse response) instead of its MVerb, so the room sounds similar rather than identical. There is no loudness normalisation yet, and downloads are the unprocessed chip output.
- The engine is stock libsidplayfp rather than ultraSID's libSidplayEZ fork.
- No C64 title screens, screenshots or portraits, and no CRT view.
- The iOS app is not started. The audio engine and UI logic are reusable; a native shell (SwiftUI plus the same emulation core) or a
  Capacitor wrapper are the likely routes.

## Licence

GPL-3.0-or-later, see [LICENSE](LICENSE). Emulation is [libsidplayfp](https://github.com/libsidplayfp/libsidplayfp) / reSIDfp
(GPL-2.0-or-later) via the [`libsidplayfp-wasm`](https://github.com/chrisgleissner/libsidplayfp-wasm) package. Its third-party notices and
corresponding source ship in `node_modules/libsidplayfp-wasm` and must be kept with any distributed build. The SID/C64 music belongs to its
composers, and HVSC has its own terms. MP3 encoding uses [lamejs](https://github.com/shijinyu/lamejs) (LGPL-3.0); JetBrains Mono is under the SIL Open Font License 1.1. The Pet Me 64 and Print Char 21 fonts are by
[Kreative Korp](https://www.kreativekorp.com/software/fonts/) under the Kreative Software Relay Fonts Free Use License
([`public/fonts/Kreative-FreeLicense.txt`](public/fonts/Kreative-FreeLicense.txt)): free to embed and redistribute, not to sell or modify.
