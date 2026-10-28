import { computed, effect, signal } from "@preact/signals";
import toneUrl from "libsidplayfp-wasm/fixtures/test-tone-c4.sid?url";
import { AudioController, type RomSet } from "./audio/controller";
import { exportAudio, type AudioFormat } from "./audio/export";
import type { CacheMode, TuneDetails } from "./audio/protocol";
import { allMeta, clearLibrary, getFile, kvDelete, kvGet, kvSet, putFile } from "./lib/db";
import { fetchManifest, fetchRemoteTune, fetchText, HVSC_URL, parseIndex, type Manifest } from "./lib/hvsc";
import { expandZips, runImport, type ImportItem } from "./lib/importer";
import { lengthForPath, parseSonglengths, type Songlengths } from "./lib/songlengths";
import { parseStil } from "./lib/stil";
import { DEFAULT_SETTINGS, SEEK_CACHE_MAX_SEC, type Playlist, type Settings, type TuneMeta } from "./lib/types";

export type View = "all" | "favorites" | "history" | `pl:${string}`;
export type SortKey = "path" | "title" | "author" | "released";

export const audio = new AudioController();

export const localTunes = signal<TuneMeta[]>([]);
export const remoteTunes = signal<TuneMeta[]>([]);
/** Imported tunes win over the online catalogue when both have the same path. */
export const tunes = computed<TuneMeta[]>(() => {
  const local = localTunes.value;
  const remote = remoteTunes.value;
  if (!local.length) return remote;
  if (!remote.length) return local;
  const map = new Map(remote.map((t) => [t.path, t]));
  for (const t of local) map.set(t.path, t);
  return [...map.values()];
});
export const hvscStatus = signal<{ state: "off" | "loading" | "ready" | "error"; text: string }>({ state: "off", text: "" });
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const favorites = signal<string[]>([]);
export const playlists = signal<Playlist[]>([]);
export const history = signal<string[]>([]);
export const roms = signal<RomSet>({});
export const songlengths = signal<Songlengths | null>(null);
export const stil = signal<Map<string, string>>(new Map());
export const remoteStil = signal<Map<string, string>>(new Map());
export const hvscAvailable = HVSC_URL !== "";

export const view = signal<View>("all");
export const query = signal("");
export const sortKey = signal<SortKey>("path");
export const sortDesc = signal(false);

export const current = signal<TuneMeta | null>(null);
export const song = signal(0);
export const details = signal<TuneDetails | null>(null);
export const playing = signal(false);
export const loading = signal(false);
export const position = signal(0);
export const duration = signal(180);
export const lengthKnown = signal(false);
export const message = signal<string | null>(null);
export const importProgress = signal<{ done: number; total: number } | null>(null);
export const nowPlayingOpen = signal(false);
export const settingsOpen = signal(false);
export const booted = signal(false);
export const voiceMuted = signal([false, false, false]);

export const tuneMap = computed(() => new Map(tunes.value.map((t) => [t.path, t])));
export const favoriteSet = computed(() => new Set(favorites.value));

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

const sortedAll = computed(() => {
  const k = sortKey.value;
  const dir = sortDesc.value ? -1 : 1;
  const list = [...tunes.value];
  list.sort((a, b) => dir * (k === "path" ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : collator.compare(a[k], b[k]) || (a.path < b.path ? -1 : 1)));
  return list;
});

export const visible = computed<TuneMeta[]>(() => {
  const v = view.value;
  const map = tuneMap.value;
  let list: TuneMeta[];
  if (v === "all") list = sortedAll.value;
  else {
    const paths = v === "favorites" ? favorites.value : v === "history" ? history.value : (playlists.value.find((p) => `pl:${p.id}` === v)?.paths ?? []);
    list = paths.map((p) => map.get(p)).filter((t): t is TuneMeta => !!t);
  }
  const tokens = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.length ? list.filter((t) => tokens.every((tok) => t.key.includes(tok))) : list;
});

// ---------- persistence ----------

function persist() {
  effect(() => void kvSet("settings", settings.value));
  effect(() => void kvSet("favorites", favorites.value));
  effect(() => void kvSet("playlists", playlists.value));
  effect(() => void kvSet("history", history.value));
}

export async function boot() {
  const [s, f, p, h, meta, sl, st, r] = await Promise.all([
    kvGet<Settings>("settings"),
    kvGet<string[]>("favorites"),
    kvGet<Playlist[]>("playlists"),
    kvGet<string[]>("history"),
    allMeta(),
    kvGet<string>("songlengths"),
    kvGet<string>("stil"),
    kvGet<RomSet>("roms"),
  ]);
  if (s) settings.value = { ...DEFAULT_SETTINGS, ...s };
  favorites.value = f ?? [];
  playlists.value = p ?? [];
  history.value = h ?? [];
  localTunes.value = meta;
  if (sl) songlengths.value = parseSonglengths(sl);
  if (st) stil.value = parseStil(st);
  if (r) roms.value = r;
  persist();
  booted.value = true;
  setupMediaSession();
  void connectHvsc();
}

// ---------- import ----------

export async function importItems(items: ImportItem[]) {
  if (!items.length) return;
  importProgress.value = { done: 0, total: items.length };
  try {
    const expanded = await expandZips(items);
    importProgress.value = { done: 0, total: expanded.length };
    const res = await runImport(expanded, (done, total) => (importProgress.value = { done, total }));
    const map = new Map(localTunes.value.map((t) => [t.path, t]));
    for (const t of res.tunes) map.set(t.path, t);
    localTunes.value = [...map.values()];
    if (res.songlengths) songlengths.value = parseSonglengths(res.songlengths);
    if (res.stil) stil.value = parseStil(res.stil);
    const extras = [res.songlengths && "song lengths", res.stil && "STIL notes"].filter(Boolean).join(" and ");
    message.value = `Added ${res.tunes.length.toLocaleString()} tune${res.tunes.length === 1 ? "" : "s"}${extras ? ` plus ${extras}` : ""}.`;
    if (!res.tunes.length && !extras) message.value = "No SID files found in that selection.";
  } catch (err) {
    message.value = `Import failed: ${err instanceof Error ? err.message : err}`;
  } finally {
    importProgress.value = null;
  }
}

export async function addTestTone() {
  const buf = await (await fetch(toneUrl)).arrayBuffer();
  await importItems([{ rawPath: "SIDtune/Test_Tone_C4.sid", read: async () => buf }]);
}

export async function wipeLibrary() {
  stop();
  await clearLibrary();
  await Promise.all([kvDelete("songlengths"), kvDelete("stil")]);
  localTunes.value = [];
  songlengths.value = null;
  stil.value = new Map();
  history.value = [];
  current.value = null;
  message.value = "Library cleared.";
}

export async function saveRoms(r: RomSet) {
  roms.value = r;
  await kvSet("roms", r);
  message.value = "ROMs saved. They apply the next time the page loads.";
}

// ---------- online HVSC catalogue ----------

/** Cached copy first, then the server (and cached for next time). */
async function tuneData(meta: TuneMeta): Promise<ArrayBuffer> {
  const cached = await getFile(meta.path);
  if (cached) return cached;
  if (!meta.remote) throw new Error("file missing from library");
  const data = await fetchRemoteTune(meta);
  void putFile(meta.path, data.slice(0));
  return data;
}

function prefetchNext() {
  const path = queue[queueIndex + 1];
  const meta = path ? tuneMap.value.get(path) : undefined;
  if (meta?.remote) void tuneData(meta).catch(() => {});
}

function stilFor(path: string): string | undefined {
  return stil.value.get(path) ?? remoteStil.value.get(path);
}
export { stilFor };

/** Loads the catalogue from cache straight away, then checks the server for a newer release. */
export async function connectHvsc(forceRefresh = false) {
  if (!hvscAvailable || !settings.value.hvsc) {
    remoteTunes.value = [];
    remoteStil.value = new Map();
    hvscStatus.value = { state: "off", text: "" };
    return;
  }
  hvscStatus.value = { state: "loading", text: "Loading the HVSC catalogue…" };
  try {
    const [cachedText, cachedMan, cachedStil] = await Promise.all([
      kvGet<string>("hvsc-index"),
      kvGet<Manifest>("hvsc-manifest"),
      kvGet<string>("hvsc-stil"),
    ]);
    if (cachedText && !forceRefresh) {
      const { tunes: list, hvsc } = parseIndex(cachedText);
      remoteTunes.value = list;
      hvscStatus.value = { state: "ready", text: `HVSC ${hvsc} · ${list.length.toLocaleString()} tunes` };
      if (cachedStil) remoteStil.value = parseStil(cachedStil);
    }

    let man: Manifest;
    try {
      man = await fetchManifest();
    } catch (err) {
      if (cachedText) return; // offline: keep what we have
      throw err;
    }
    if (man.index !== cachedMan?.index || !cachedText) {
      hvscStatus.value = { state: "loading", text: `Downloading HVSC ${man.hvsc} catalogue…` };
      const text = await fetchText(man.index);
      const { tunes: list, hvsc } = parseIndex(text);
      remoteTunes.value = list;
      await kvSet("hvsc-index", text);
      if (cachedMan && cachedMan.hvsc !== man.hvsc) message.value = `HVSC updated to ${hvsc}.`;
      hvscStatus.value = { state: "ready", text: `HVSC ${hvsc} · ${list.length.toLocaleString()} tunes` };
    }
    if (man.stil !== cachedMan?.stil || !cachedStil) {
      const text = await fetchText(man.stil);
      remoteStil.value = parseStil(text);
      await kvSet("hvsc-stil", text);
    }
    await kvSet("hvsc-manifest", man);
  } catch (err) {
    hvscStatus.value = { state: "error", text: `Could not load the HVSC catalogue: ${err instanceof Error ? err.message : err}` };
  }
}

// ---------- playback ----------

let queue: string[] = [];
let queueIndex = -1;
let currentData: ArrayBuffer | null = null;
let playToken = 0;
const played: string[] = [];

audio.onLoaded = (info) => {
  details.value = info;
  audio.fx?.setMono(info.sidChips <= 1);
  audio.fx?.setMains(info.clock === "NTSC" ? 60 : 50);
  loading.value = false;
  const t = current.value;
  const sl = songlengths.value;
  let len: number | null = t?.lengths?.[info.currentSong - 1] ?? null;
  if (len === null && sl) len = (info.md5 ? sl.db.lengthSeconds(info.md5, info.currentSong) : null) ?? (t ? lengthForPath(sl, t.path, info.currentSong) : null);
  lengthKnown.value = len !== null;
  duration.value = len ?? settings.value.defaultLengthSec;
};

audio.onSeeked = () => {
  loading.value = false;
};

audio.onWorking = () => {
  loading.value = true;
};

audio.onError = (m) => {
  loading.value = false;
  message.value = `Could not play this tune: ${m}`;
};

/** Decides how much of a tune to keep rendered in memory for instant seeking. */
function cacheFor(meta: TuneMeta, songIndex: number): CacheMode {
  const s = settings.value;
  if (!s.seekCache) return { mode: "off" };
  const len = meta.lengths?.[songIndex] ?? lengthForPath(songlengths.value, meta.path, songIndex + 1) ?? s.defaultLengthSec;
  return len <= SEEK_CACHE_MAX_SEC ? { mode: "prerender", sec: len + 2 } : { mode: "record", sec: SEEK_CACHE_MAX_SEC };
}

async function ensureAudio() {
  await audio.init(settings.value, roms.value, settings.value.volume, { mode: settings.value.fxMode, eq: settings.value.eq });
}

async function start(path: string, songIndex: number | null) {
  const meta = tuneMap.value.get(path);
  if (!meta) return;
  const token = ++playToken;
  loading.value = true;
  try {
    await ensureAudio();
    const data = await tuneData(meta);
    if (token !== playToken) return;
    currentData = data;
    current.value = meta;
    song.value = songIndex ?? meta.startSong - 1;
    position.value = 0;
    details.value = null;
    audio.load(data, song.value, 0, cacheFor(meta, song.value));
    await audio.resume();
    playing.value = true;
    history.value = [path, ...history.value.filter((p) => p !== path)].slice(0, 500);
    updateMediaSession();
    prefetchNext();
  } catch (err) {
    loading.value = false;
    message.value = `Could not play: ${err instanceof Error ? err.message : err}`;
  }
}

/** Starts a tune from the currently visible list so next/previous follow what the user sees. */
export function playFromList(path: string) {
  queue = visible.value.map((t) => t.path);
  queueIndex = queue.indexOf(path);
  played.length = 0;
  void start(path, null);
}

export function playPaths(paths: string[], first = 0) {
  if (!paths.length) return;
  queue = [...paths];
  queueIndex = first;
  played.length = 0;
  void start(queue[first], null);
}

export function selectSong(i: number) {
  if (!current.value || !currentData) return;
  song.value = i;
  position.value = 0;
  loading.value = true;
  audio.load(currentData, i, 0, current.value ? cacheFor(current.value, i) : undefined);
  void audio.resume();
  playing.value = true;
}

export async function togglePlay() {
  if (!current.value) {
    const first = visible.value[0];
    if (first) playFromList(first.path);
    return;
  }
  const next = !playing.value;
  playing.value = next;
  await audio.setPaused(!next);
}

export function stop() {
  playToken++;
  playing.value = false;
  current.value = null;
  details.value = null;
  void audio.setPaused(true);
}

export function next(auto = false) {
  if (!queue.length) return;
  const s = settings.value;
  if (auto && s.repeat === "one" && current.value) return void start(current.value.path, song.value);
  if (current.value) played.push(current.value.path);
  if (s.shuffle && queue.length > 1) {
    let i = queueIndex;
    while (i === queueIndex) i = Math.floor(Math.random() * queue.length);
    queueIndex = i;
  } else if (queueIndex + 1 < queue.length) {
    queueIndex++;
  } else if (s.repeat === "all" || !auto) {
    queueIndex = 0;
  } else {
    playing.value = false;
    void audio.setPaused(true);
    return;
  }
  void start(queue[queueIndex], null);
}

export function previous() {
  if (position.value > 3 && current.value) return seek(0);
  const prev = played.pop();
  if (prev) {
    queueIndex = Math.max(0, queue.indexOf(prev));
    void start(prev, null);
  } else if (queueIndex > 0) {
    queueIndex--;
    void start(queue[queueIndex], null);
  } else seek(0);
}

export function seek(seconds: number) {
  if (!current.value) return;
  const s = Math.max(0, Math.min(seconds, duration.value));
  position.value = s;
  loading.value = true;
  audio.seek(s);
}

export function setVolume(v: number) {
  settings.value = { ...settings.value, volume: v };
  audio.setVolume(v);
}

export const soundMenuOpen = signal(false);

export function updateSettings(patch: Partial<Settings>) {
  const before = settings.value;
  settings.value = { ...before, ...patch };
  if (patch.fxMode) audio.fx?.setMode(patch.fxMode);
  if (patch.eq) audio.fx?.setEq(patch.eq);
  const engineChanged = (["engine", "sidModel", "c64Model", "digiBoost", "seekCache"] as const).some((k) => before[k] !== settings.value[k]);
  if (engineChanged) {
    audio.applySettings(settings.value);
    if (current.value && currentData) {
      const at = position.value;
      loading.value = true;
      audio.load(currentData, song.value, at, cacheFor(current.value, song.value));
    }
  }
}

export function toggleVoice(v: number) {
  const m = [...voiceMuted.value];
  m[v] = !m[v];
  voiceMuted.value = m;
  audio.setMute(v, m[v]);
}

// position ticker / auto-advance
setInterval(() => {
  if (!playing.value || loading.value || !current.value) return;
  const p = audio.position();
  position.value = p;
  if (p >= duration.value || audio.hasEnded()) next(true);
}, 100);

// ---------- favourites & playlists ----------

export function toggleFavorite(path: string) {
  favorites.value = favoriteSet.value.has(path) ? favorites.value.filter((p) => p !== path) : [path, ...favorites.value];
}

export function createPlaylist(name: string, firstPath?: string): Playlist {
  const pl: Playlist = { id: crypto.randomUUID(), name: name.trim() || "Untitled", paths: firstPath ? [firstPath] : [] };
  playlists.value = [...playlists.value, pl];
  return pl;
}

export function addToPlaylist(id: string, path: string) {
  playlists.value = playlists.value.map((p) => (p.id === id && !p.paths.includes(path) ? { ...p, paths: [...p.paths, path] } : p));
}

export function removeFromPlaylist(id: string, path: string) {
  playlists.value = playlists.value.map((p) => (p.id === id ? { ...p, paths: p.paths.filter((x) => x !== path) } : p));
}

export function deletePlaylist(id: string) {
  playlists.value = playlists.value.filter((p) => p.id !== id);
  if (view.value === `pl:${id}`) view.value = "all";
}

export function renamePlaylist(id: string, name: string) {
  playlists.value = playlists.value.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
}

// ---------- export ----------

export type DownloadFormat = "sid" | AudioFormat;
export const exporting = signal(false);

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function downloadCurrent(format: DownloadFormat) {
  const t = current.value;
  if (!t || !currentData || exporting.value) return;
  if (format === "sid") {
    save(new Blob([currentData], { type: "application/octet-stream" }), t.path.split("/").pop() || "tune.sid");
    return;
  }
  const label = format.toUpperCase();
  const multi = (details.value?.songs ?? t.songs) > 1;
  exporting.value = true;
  message.value = `Rendering ${label}…`;
  try {
    const blob = await exportAudio(
      {
        format,
        data: currentData.slice(0),
        song: song.value,
        seconds: duration.value,
        settings: settings.value,
        roms: roms.value,
        tags: { title: t.title, artist: t.author, released: t.released, track: multi ? song.value + 1 : undefined },
      },
      (stage, f) => (message.value = `${stage === "render" ? "Rendering" : "Encoding"} ${label}… ${Math.round(f * 100)}%`),
    );
    save(blob, `${t.title.replace(/[^\w.-]+/g, "_")}${multi ? `_${song.value + 1}` : ""}.${format}`);
    message.value = `${label} saved.`;
  } catch (err) {
    message.value = `Export failed: ${err instanceof Error ? err.message : err}`;
  } finally {
    exporting.value = false;
  }
}

// ---------- media session ----------

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => void togglePlay());
  ms.setActionHandler("pause", () => void togglePlay());
  ms.setActionHandler("nexttrack", () => next());
  ms.setActionHandler("previoustrack", () => previous());
  ms.setActionHandler("seekto", (d) => d.seekTime != null && seek(d.seekTime));
}

function updateMediaSession() {
  const t = current.value;
  if (!t || !("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.author, album: t.released });
}

export function formatTime(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
