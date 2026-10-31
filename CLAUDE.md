# SIDtune

Browser-based Commodore 64 SID music player (Preact + TypeScript + Vite). Inspired by ultraSID, but independent: no ultraSID code is used.
GPL-3.0-or-later. Everything runs client-side; library, playlists and settings live in IndexedDB.

## Commands

```bash
npm run dev         # http://localhost:5173, also serves ./hvsc-build at /hvsc
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + static site in dist/ (relative base, host anywhere)
node tools/build-hvsc.mjs <path to C64Music> [outDir]   # builds the online catalogue (Node >= 22.18)
```

There is no test suite. Verify changes by running the dev server and playing audio in the browser. In dev, `window.__sidtune` exposes
`src/state.ts` for driving the app from the console (use it instead of `import('/src/state.ts')`, which can create a second module instance
after HMR).

## Architecture

- `src/audio/engine.worker.ts`: runs `libsidplayfp-wasm`'s `SidAudioEngine`, renders 1024-frame PCM chunks about 0.35 s ahead, snapshots SID
  registers with each chunk, and sends PCM straight to the worklet over a `MessageChannel`. Messages are processed one at a time.
- `src/audio/cache.worker.ts`: second worker (own thread) that renders the whole tune into chunks and posts them to the playback worker
  over a `MessageChannel`. The playback worker keeps them in `cache[]` and streams from there (`source = "cache"`) after a seek, or as
  soon as the cache covers the live position; a seek past what is rendered waits for it (`pendingSeek`). Tunes over
  `SEEK_CACHE_MAX_SEC` use `record` mode (remembers played audio only) unless `prerenderLong` is on (the default). Anything that changes
  the mix (voice mute, settings, load) invalidates the cache via `resetCache`; a mute while playing from the cache keeps the old one
  (`staleCache`) playing until the re-render reaches the playhead. Settings: `seekCache`, `prerenderLong`,
  `showPrerender` (progress line under the seek bar, fed by `cache` messages from the playback worker).
- `public/sid-worklet.js`: plain JS `AudioWorkletProcessor` (not bundled). Plays queued chunks and reports frames played. Chunks carry a
  generation number; a `flush` message with a new generation drops stale audio. Loads, seeks and settings changes all bump the generation.
- `src/audio/fx.ts`: the audio quality modes as a Web Audio graph between the worklet and the volume gain (LR8 crossover, wide-mono, ping-pong delay, convolver reverb, 3-band EQ, plus the REAL speaker chain). Parameter values come from ultraSID's `SIDEffects`/`FXTuning`; mode changes glide via `setTargetAtTime`. Web Audio lowpass/highpass `Q` is in dB, peaking `Q` is linear.
- `src/audio/export.worker.ts`: throwaway worker per download that renders the current subtune at 44.1 kHz and encodes WAV, FLAC
  (own encoder in `flac.ts`) or MP3 (`@breezystack/lamejs`, 256 kbps) with tags, so playback keeps running. Exports are the raw
  emulator output: no voice mutes, no audio quality mode/EQ. "Original SID" just saves the loaded bytes.
- `src/audio/controller.ts`: main-thread owner of the AudioContext, worker and worklet. Position = `baseSec + playedFrames / sampleRate`.
- `src/state.ts`: all app state as Preact signals plus playback/queue/playlist logic, shared links (`?tune=<path>&song=<n>`). `src/ui/*`
  is presentational Preact. Shortcuts live in `src/ui/App.tsx`.
- `src/lib/prefs.ts`: theme, font, tooltips and welcome-on-startup, kept in localStorage (not IndexedDB) so the inline script in `index.html`
  can set `data-theme` and `data-font` before the first paint. Fonts are `[data-font]` blocks setting `--font` (and `--mono`);
  bundle font files with the app (npm `@fontsource*`, or `src/assets/fonts/`), never load them from a third-party CDN.
- The Kreative Korp fonts in `src/assets/fonts/` (Pet Me 64, Print Char 21) must stay byte-identical to the originals: their licence
  forbids modifying them, so no WOFF2 conversion or subsetting. Keep `public/fonts/Kreative-FreeLicense.txt` (ships with the site) and the
  credit in the About window.
- Themes are `[data-theme]` blocks in `src/styles.css` that override the `:root` tokens. Never hardcode a colour in CSS or components:
  add a token (the visualiser reads `--viz-*` from CSS; keep those as plain hex, the canvas can't parse `color-mix()`).
- `src/ui/Ask.tsx` replaces `confirm()`/`prompt()` (`confirmDialog`, `promptDialog`); don't use the browser's.
- `docs/MANUAL.md` (Help) and `CHANGELOG.md` (Version history) are bundled with `?raw` and rendered by `src/lib/markdown.ts`, which only
  knows headings, paragraphs, lists, pipe tables, `code`, **bold**, *italic* and links.
- `src/lib/`: PSID header parser, IndexedDB wrapper (`meta`, `files`, `kv` stores), importers (folder, drop, zip), Songlengths/STIL parsers,
  and the online HVSC client (`hvsc.ts`).
- Tunes are keyed by HVSC-style path (`/MUSICIANS/H/Hubbard_Rob/Commando.sid`). Favorites, playlists and history store paths. Imported tunes
  override online catalogue entries with the same path.

## Things that bite

- `SidAudioEngine` only creates its C++ context on the first `loadSidBuffer`. Call `setEmulationConfig` after a load, never before.
  `setSystemROMs` is fine before.
- Song indices passed to the engine are 0-based; `TuneMeta.startSong` and `songs` are 1-based.
- Without the cache, seeking has no fast path in the bindings: forward seeks fast-forward the current context (cost = distance, via the wrapper's private
  `fastForwardContext`), backward seeks reload and fast-forward from 0. reSIDfp does this at roughly 7x realtime, SIDLite much faster.
- The wasm files are imported with `?url` in the worker so Vite emits them; the glue code's `module` import produces harmless Vite warnings.
- Browsers throttle `requestAnimationFrame` in the preview pane to ~1 fps, so the visualiser can't be judged there.
- System media controls (media keys, lock screen) only reach pages playing an `<audio>`/`<video>` element, not Web Audio, so
  `src/audio/media-anchor.ts` loops a silent WAV while `playing` is true. Its first `play()` must be in the tap (iOS): `start()` calls
  `anchorMedia(true)` before its first `await`.
- `pkill -f vite` or `pgrep -f vite` inside a Bash tool call matches the shell itself; stop servers by port instead.

## Online HVSC catalogue

Enabled when `VITE_HVSC_URL` is set at build time (defaults to `/hvsc` in dev, off in production). The tunes are copyrighted and HVSC's
disclaimer limits use to private enjoyment: do not publish pack files publicly or suggest doing so without permission from HVSC / rights
holders. See `docs/HVSC-HOSTING.md`. `hvsc-build/` is git-ignored (hundreds of MB).

## Conventions

- **Every commit bumps the version and the changelog.** Bump `version` in `package.json` (semver: minor = new feature, patch = fix or
  polish) and add an entry at the top of `CHANGELOG.md` (`## x.y.z — YYYY-MM-DD`). Write entries for listeners: what changed for them and
  why, in prose, not commit messages. The version shows next to the logo (`__APP_VERSION__`, defined in `vite.config.ts`).
- Keep `docs/MANUAL.md` in step with user-visible changes (new settings, shortcuts, formats).

- Match the existing style: small modules, no comments that restate code, TypeScript strict (including `noUnusedLocals`).
- Commit or push only when asked. Remote is `origin` = github.com/marian8090/SIDtune (main).
- Not started: iOS app, Ogg/Opus export, title screens/CRT view. Possible engine upgrade: build ultraSID's libSidplayEZ to WASM (needs
  Emscripten and CMake, not installed here).
