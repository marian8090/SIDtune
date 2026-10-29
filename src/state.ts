import { computed, effect, signal } from "@preact/signals";
import toneUrl from "libsidplayfp-wasm/fixtures/test-tone-c4.sid?url";
import { AudioController, type RomSet } from "./audio/controller";
import { anchorMedia, setOnSystemPause } from "./audio/media-anchor";
import { exportAudio, type AudioFormat } from "./audio/export";
import type { CacheMode, TuneDetails } from "./audio/protocol";
import { allMeta, clearLibrary, fileKeys, getFile, kvDelete, kvGet, kvSet, putFile, putFiles } from "./lib/db";
import { fetchManifest, fetchPack, fetchRemoteTune, fetchText, HVSC_URL, parseIndex, type Manifest } from "./lib/hvsc";
import { expandZips, runImport, type ImportItem } from "./lib/importer";
import { lengthForPath, parseSonglengths, type Songlengths } from "./lib/songlengths";
import { parseStil } from "./lib/stil";
import { DEFAULT_SETTINGS, SEEK_CACHE_MAX_SEC, touchDevice, type Playlist, type Settings, type TuneMeta } from "./lib/types";

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
export const hvscManifest = signal<Manifest | null>(null);
export const collectionDownload = signal<{ done: number; total: number } | null>(null);

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
export const nowPlayingOpen = signal(typeof matchMedia === "function" && matchMedia("(min-width: 1101px)").matches);
export const settingsOpen = signal(false);
export const docOpen = signal<"manual" | "changelog" | null>(null);
export const aboutOpen = signal(false);
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

export const storagePersisted = signal<boolean | null>(null);
let persistAsked = false;

/** Asks the browser not to evict our data under storage pressure; Firefox shows a prompt, so wait until there is something to keep. */
async function requestPersistence(force = false) {
  const st = navigator.storage;
  if (!st?.persist) return;
  if (await st.persisted()) storagePersisted.value = true;
  else if (!persistAsked && (force || favorites.value.length || playlists.value.length || localTunes.value.length)) {
    persistAsked = true;
    storagePersisted.value = await st.persist();
  } else storagePersisted.value = false;
}

function persist() {
  effect(() => {
    if (!persistAsked && (favorites.value.length || playlists.value.length || localTunes.value.length)) void requestPersistence();
  });
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
  void requestPersistence();
  booted.value = true;
  setupMediaSession();
  void openSharedLink(connectHvsc());
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
  stopCollectionDownload();
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

let collectionAbort: AbortController | null = null;

/** Tunes of the online catalogue not yet stored in this browser, grouped by pack. */
async function missingByPart(): Promise<Map<number, TuneMeta[]>> {
  const have = new Set(await fileKeys());
  const byPart = new Map<number, TuneMeta[]>();
  for (const t of remoteTunes.value) {
    if (!t.remote || have.has(t.path)) continue;
    const list = byPart.get(t.remote.part);
    if (list) list.push(t);
    else byPart.set(t.remote.part, [t]);
  }
  return byPart;
}

/** Bytes still to download for the whole collection (whole packs, since that is what gets fetched). */
export async function collectionMissingBytes(): Promise<number> {
  const man = hvscManifest.value;
  if (!man) return 0;
  return [...(await missingByPart()).keys()].reduce((a, i) => a + (man.parts[i]?.size ?? 0), 0);
}

/** Downloads every pack that still has tunes missing here and stores each tune, so the whole catalogue plays offline. */
export async function downloadCollection() {
  const man = hvscManifest.value;
  if (!man || collectionDownload.value) return;
  const byPart = await missingByPart();
  if (!byPart.size) {
    message.value = "The whole collection is already in this browser.";
    return;
  }
  const total = [...byPart.keys()].reduce((a, i) => a + (man.parts[i]?.size ?? 0), 0);
  collectionDownload.value = { done: 0, total };
  collectionAbort = new AbortController();
  void requestPersistence(true);
  let stored = 0;
  try {
    for (const [part, list] of byPart) {
      const buf = await fetchPack(part, collectionAbort.signal, (n) => {
        const d = collectionDownload.value!;
        collectionDownload.value = { done: d.done + n, total: d.total };
      });
      await putFiles(list.map((t) => [t.path, buf.slice(t.remote!.offset, t.remote!.offset + t.size)]));
      stored += list.length;
    }
    message.value = `The whole HVSC is now in this browser and plays offline (${stored.toLocaleString()} tunes added).`;
  } catch (err) {
    message.value = collectionAbort.signal.aborted
      ? `Download stopped. ${stored.toLocaleString()} tunes were kept; downloading again picks up the rest.`
      : `The download failed: ${err instanceof Error ? err.message : err}. Tunes already stored are kept.`;
  } finally {
    collectionDownload.value = null;
    collectionAbort = null;
  }
}

export function stopCollectionDownload() {
  collectionAbort?.abort();
}

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
    if (cachedMan) hvscManifest.value = cachedMan;
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
    hvscManifest.value = man;
  } catch (err) {
    hvscStatus.value = { state: "error", text: `Could not load the HVSC catalogue: ${err instanceof Error ? err.message : err}` };
  }
}

// ---------- playback ----------

let queue: string[] = [];
let queueIndex = -1;
/** The list the queue was started from. While it is on screen, the queue follows it, so a new search or sort changes what plays next. */
let queueView: View | null = null;
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
  updatePositionState();
};

audio.onSeeked = () => {
  loading.value = false;
  updatePositionState();
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
  anchorMedia(true); // still inside the tap that started this, which iOS needs for the first play
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
    anchorMedia(playing.value);
    message.value = `Could not play: ${err instanceof Error ? err.message : err}`;
  }
}

/** Starts a tune from the currently visible list so next/previous follow what the user sees. */
export function playFromList(path: string, songIndex: number | null = null) {
  queueView = view.value;
  queue = visible.value.map((t) => t.path);
  queueIndex = queue.indexOf(path);
  if (queueIndex < 0) {
    queue = [path];
    queueIndex = 0;
  }
  played.length = 0;
  void start(path, songIndex);
}

export function playPaths(paths: string[], first = 0) {
  if (!paths.length) return;
  queueView = null;
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

function queueRanOut(repeatAll: boolean) {
  return queue.length <= 1 || (!repeatAll && queueIndex + 1 >= queue.length);
}

/** Switches the queue to the list on screen, positioned just after the playing tune (or at its top). */
function adoptVisibleQueue() {
  const list = visible.value;
  if (view.value === queueView || !list.length) return false;
  queueView = view.value;
  queue = list.map((t) => t.path);
  const at = current.value ? queue.indexOf(current.value.path) : -1;
  queueIndex = at + 1 < queue.length ? at + 1 : 0;
  return true;
}

export function next(auto = false) {
  if (!queue.length) return;
  const s = settings.value;
  if (auto && s.repeat === "one" && current.value) return void start(current.value.path, song.value);
  if (current.value) played.push(current.value.path);
  if (!auto && queueRanOut(s.repeat === "all") && adoptVisibleQueue()) return void start(queue[queueIndex], null);
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

effect(() => {
  const list = visible.value;
  // a search with no matches (often half-typed) keeps the previous queue rather than leaving nothing to play
  if (view.value !== queueView || !list.length) return;
  queue = list.map((t) => t.path);
  const playingPath = current.peek()?.path;
  // -1 when the playing tune is filtered out: next then starts from the top of the new list
  queueIndex = playingPath ? queue.indexOf(playingPath) : -1;
});

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

// ---------- backup ----------

interface Backup {
  app: "sidtune";
  version: 1;
  favorites: string[];
  playlists: Playlist[];
  history: string[];
  settings: Settings;
}

export function exportBackup() {
  const b: Backup = { app: "sidtune", version: 1, favorites: favorites.value, playlists: playlists.value, history: history.value, settings: settings.value };
  save(new Blob([JSON.stringify(b, null, 1)], { type: "application/json" }), `sidtune-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function restoreBackup(file: File) {
  let b: Partial<Backup>;
  try {
    b = JSON.parse(await file.text());
  } catch {
    b = {};
  }
  const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((p) => typeof p === "string");
  const lists = (x: unknown): x is Playlist[] =>
    Array.isArray(x) && x.every((p) => p && typeof p.id === "string" && typeof p.name === "string" && strings(p.paths));
  if (b.app !== "sidtune" || !strings(b.favorites) || !lists(b.playlists) || !strings(b.history)) {
    message.value = "That file is not a SIDtune backup.";
    return;
  }
  favorites.value = b.favorites;
  playlists.value = b.playlists;
  history.value = b.history;
  if (b.settings && typeof b.settings === "object") {
    const hvscBefore = settings.value.hvsc;
    updateSettings({ ...DEFAULT_SETTINGS, ...b.settings });
    setVolume(settings.value.volume);
    if (settings.value.hvsc !== hvscBefore) void connectHvsc();
  }
  if (view.value.startsWith("pl:") && !playlists.value.some((p) => `pl:${p.id}` === view.value)) view.value = "all";
  const n = b.playlists.length;
  message.value = `Restored ${b.favorites.length.toLocaleString()} favorite${b.favorites.length === 1 ? "" : "s"} and ${n} playlist${n === 1 ? "" : "s"}.`;
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

// ---------- shared links ----------

/** A tune opened from a shared link, waiting for a tap (browsers only start audio from a user gesture). */
export const sharedTune = signal<{ meta: TuneMeta; song: number | null } | null>(null);
export const openedFromLink = new URLSearchParams(location.search).has("tune");

export function shareUrl(path: string, songIndex: number | null): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("tune", path);
  if (songIndex !== null) u.searchParams.set("song", String(songIndex + 1));
  return u.href;
}

export async function shareCurrent() {
  const t = current.value;
  if (!t) return;
  const url = shareUrl(t.path, song.value !== t.startSong - 1 ? song.value : null);
  const online = remoteTunes.value.some((r) => r.path === t.path);
  if (touchDevice && navigator.share) {
    try {
      await navigator.share({ title: `${t.title} by ${t.author}`, url });
    } catch {
      // cancelled
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    message.value = online ? "Link copied." : "Link copied. This tune is not in the online catalogue, so the link only works for people who have it too.";
  } catch {
    message.value = url;
  }
}

async function openSharedLink(catalogue: Promise<void>) {
  const params = new URLSearchParams(location.search);
  const path = params.get("tune");
  if (!path) return;
  const n = Number(params.get("song"));
  clearLinkParams();
  if (!tuneMap.value.has(path)) await catalogue;
  const meta = tuneMap.value.get(path);
  if (!meta) {
    message.value = "The shared tune is not in your library or the online catalogue.";
    return;
  }
  sharedTune.value = { meta, song: Number.isInteger(n) && n >= 1 && n <= meta.songs ? n - 1 : null };
}

/** Drops ?tune= from the address bar once it is handled, so a reload does not re-open it. */
function clearLinkParams() {
  const u = new URL(location.href);
  u.searchParams.delete("tune");
  u.searchParams.delete("song");
  window.history.replaceState(null, "", u);
}

// ---------- media session ----------

function setupMediaSession() {
  setOnSystemPause(() => playing.value && void togglePlay());
  effect(() => anchorMedia(playing.value));
  effect(() => {
    const on = playing.value;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = current.value ? (on ? "playing" : "paused") : "none";
    updatePositionState();
  });
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => !playing.value && void togglePlay());
  ms.setActionHandler("pause", () => playing.value && void togglePlay());
  ms.setActionHandler("stop", () => playing.value && void togglePlay());
  ms.setActionHandler("nexttrack", () => next());
  ms.setActionHandler("previoustrack", () => previous());
  ms.setActionHandler("seekto", (d) => d.seekTime != null && seek(d.seekTime));
}

function updateMediaSession() {
  const t = current.value;
  if (!t || !("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.author, album: t.released });
}

/** Lets the lock screen and system controls show a progress bar. */
function updatePositionState() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = duration.peek();
  try {
    if (current.peek()) navigator.mediaSession.setPositionState({ duration: d, position: Math.min(position.peek(), d), playbackRate: 1 });
    else navigator.mediaSession.setPositionState();
  } catch {
    // rejects inconsistent values while a load is in flight
  }
}

export function formatTime(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
