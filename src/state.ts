import { computed, effect, signal } from "@preact/signals";
import toneUrl from "libsidplayfp-wasm/fixtures/test-tone-c4.sid?url";
import { AudioController, type RomSet } from "./audio/controller";
import type { TuneDetails } from "./audio/protocol";
import { allMeta, clearLibrary, getFile, kvDelete, kvGet, kvSet } from "./lib/db";
import { expandZips, runImport, type ImportItem } from "./lib/importer";
import { lengthForPath, parseSonglengths, type Songlengths } from "./lib/songlengths";
import { parseStil } from "./lib/stil";
import { DEFAULT_SETTINGS, type Playlist, type Settings, type TuneMeta } from "./lib/types";

export type View = "all" | "favorites" | "history" | `pl:${string}`;
export type SortKey = "path" | "title" | "author" | "released";

export const audio = new AudioController();

export const tunes = signal<TuneMeta[]>([]);
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const favorites = signal<string[]>([]);
export const playlists = signal<Playlist[]>([]);
export const history = signal<string[]>([]);
export const roms = signal<RomSet>({});
export const songlengths = signal<Songlengths | null>(null);
export const stil = signal<Map<string, string>>(new Map());

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

const sortedAll = computed(() => {
  const k = sortKey.value;
  const dir = sortDesc.value ? -1 : 1;
  const list = [...tunes.value];
  list.sort((a, b) => dir * (k === "path" ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : a[k].localeCompare(b[k], undefined, { sensitivity: "base" }) || (a.path < b.path ? -1 : 1)));
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
  tunes.value = meta;
  if (sl) songlengths.value = parseSonglengths(sl);
  if (st) stil.value = parseStil(st);
  if (r) roms.value = r;
  persist();
  booted.value = true;
  setupMediaSession();
}

// ---------- import ----------

export async function importItems(items: ImportItem[]) {
  if (!items.length) return;
  importProgress.value = { done: 0, total: items.length };
  try {
    const expanded = await expandZips(items);
    importProgress.value = { done: 0, total: expanded.length };
    const res = await runImport(expanded, (done, total) => (importProgress.value = { done, total }));
    const map = new Map(tunes.value.map((t) => [t.path, t]));
    for (const t of res.tunes) map.set(t.path, t);
    tunes.value = [...map.values()];
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
  tunes.value = [];
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

// ---------- playback ----------

let queue: string[] = [];
let queueIndex = -1;
let currentData: ArrayBuffer | null = null;
let playToken = 0;
const played: string[] = [];

audio.onLoaded = (info) => {
  details.value = info;
  loading.value = false;
  const t = current.value;
  const sl = songlengths.value;
  let len: number | null = null;
  if (sl) len = (info.md5 ? sl.db.lengthSeconds(info.md5, info.currentSong) : null) ?? (t ? lengthForPath(sl, t.path, info.currentSong) : null);
  lengthKnown.value = len !== null;
  duration.value = len ?? settings.value.defaultLengthSec;
};

audio.onSeeked = () => {
  loading.value = false;
};

audio.onError = (m) => {
  loading.value = false;
  message.value = `Could not play this tune: ${m}`;
};

async function ensureAudio() {
  await audio.init(settings.value, roms.value, settings.value.volume);
}

async function start(path: string, songIndex: number | null) {
  const meta = tuneMap.value.get(path);
  if (!meta) return;
  const token = ++playToken;
  loading.value = true;
  try {
    await ensureAudio();
    const data = await getFile(path);
    if (!data) throw new Error("file missing from library");
    if (token !== playToken) return;
    currentData = data;
    current.value = meta;
    song.value = songIndex ?? meta.startSong - 1;
    position.value = 0;
    details.value = null;
    audio.load(data, song.value);
    await audio.resume();
    playing.value = true;
    history.value = [path, ...history.value.filter((p) => p !== path)].slice(0, 500);
    updateMediaSession();
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
  audio.load(currentData, i);
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

export function updateSettings(patch: Partial<Settings>) {
  const before = settings.value;
  settings.value = { ...before, ...patch };
  const engineChanged = (["engine", "sidModel", "c64Model", "digiBoost"] as const).some((k) => before[k] !== settings.value[k]);
  if (engineChanged) {
    audio.applySettings(settings.value);
    if (current.value && currentData) {
      const at = position.value;
      loading.value = true;
      audio.load(currentData, song.value, at);
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

export async function exportCurrentWav() {
  const t = current.value;
  if (!t || !currentData) return;
  message.value = "Rendering WAV…";
  const wav = await audio.exportWav(currentData, song.value, duration.value);
  if (!wav) {
    message.value = "Export failed.";
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  a.download = `${t.title.replace(/[^\w.-]+/g, "_")}${t.songs > 1 ? `_${song.value + 1}` : ""}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  message.value = "WAV saved.";
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
