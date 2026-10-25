import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  addToPlaylist,
  createPlaylist,
  current,
  favoriteSet,
  formatTime,
  playFromList,
  playing,
  playlists,
  removeFromPlaylist,
  songlengths,
  sortDesc,
  sortKey,
  toggleFavorite,
  view,
  visible,
  type SortKey,
} from "../state";
import { lengthForPath } from "../lib/songlengths";
import { Heart, HeartOutline, Plus, Trash } from "./Icons";

const ROW = 52;
const menu = signal<{ path: string; x: number; y: number } | null>(null);

export function TrackList() {
  const box = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // jump back to the top when the list itself changes
  useEffect(() => {
    if (box.current) box.current.scrollTop = 0;
  }, [view.value, sortKey.value, sortDesc.value]);

  const list = visible.value;
  const first = Math.max(0, Math.floor(scroll / ROW) - 6);
  const last = Math.min(list.length, Math.ceil((scroll + height) / ROW) + 6);
  const rows = list.slice(first, last);
  const sl = songlengths.value;
  const favs = favoriteSet.value;
  const plId = view.value.startsWith("pl:") ? view.value.slice(3) : null;

  const head = (k: SortKey, label: string, cls: string) => (
    <button class={`th ${cls} ${sortKey.value === k ? "on" : ""}`} onClick={() => {
      if (sortKey.value === k) sortDesc.value = !sortDesc.value;
      else {
        sortKey.value = k;
        sortDesc.value = false;
      }
    }}>
      {label}
      {sortKey.value === k && <i>{sortDesc.value ? "▼" : "▲"}</i>}
    </button>
  );

  return (
    <div class="tracklist">
      <div class="thead">
        <span class="th idx">#</span>
        {head("title", "Title", "c-title")}
        {head("author", "Composer", "c-author")}
        {head("released", "Released", "c-rel")}
        <span class="th c-len">Time</span>
        <span class="th c-act" />
      </div>
      <div class="tbody" ref={box} onScroll={(e) => setScroll((e.currentTarget as HTMLElement).scrollTop)}>
        <div style={{ height: list.length * ROW, position: "relative" }}>
          {rows.map((t, i) => {
            const idx = first + i;
            const isCur = current.value?.path === t.path;
            const len = t.lengths?.[t.startSong - 1] ?? lengthForPath(sl, t.path, t.startSong);
            return (
              <div
                key={t.path}
                class={`row ${isCur ? "current" : ""}`}
                style={{ transform: `translateY(${idx * ROW}px)`, height: ROW }}
                onClick={() => playFromList(t.path)}
              >
                <span class="idx">{isCur && playing.value ? <Eq /> : idx + 1}</span>
                <span class="c-title">
                  <b>{t.title}</b>
                  <small class="sub">{t.author}</small>
                </span>
                <span class="c-author">{t.author}</span>
                <span class="c-rel">{t.released}</span>
                <span class="c-len">
                  {len !== null ? formatTime(len) : "–"}
                  {t.songs > 1 && <small> · {t.songs} songs</small>}
                </span>
                <span class="c-act" onClick={(e) => e.stopPropagation()}>
                  <button class={`icon-btn ${favs.has(t.path) ? "fav" : ""}`} title="Favorite" onClick={() => toggleFavorite(t.path)}>
                    {favs.has(t.path) ? <Heart /> : <HeartOutline />}
                  </button>
                  <button class="icon-btn" title="Add to playlist" onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    menu.value = { path: t.path, x: r.right, y: r.bottom };
                  }}>
                    <Plus />
                  </button>
                  {plId && (
                    <button class="icon-btn danger" title="Remove from this playlist" onClick={() => removeFromPlaylist(plId, t.path)}>
                      <Trash />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {!list.length && <div class="empty">{view.value === "all" ? "No tunes match your search." : "Nothing here yet."}</div>}
      </div>
      <PlaylistMenu />
    </div>
  );
}

function Eq() {
  return (
    <span class="eq" aria-label="Playing">
      <i /><i /><i />
    </span>
  );
}

function PlaylistMenu() {
  const m = menu.value;
  useEffect(() => {
    if (!m) return;
    const close = () => (menu.value = null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [m]);
  if (!m) return null;
  const left = Math.max(8, Math.min(window.innerWidth - 228, m.x - 220));
  const top = Math.min(window.innerHeight - 260, m.y + 4);
  return (
    <div class="popover" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div class="pop-title">Add to playlist</div>
      {playlists.value.map((p) => (
        <button key={p.id} onClick={() => { addToPlaylist(p.id, m.path); menu.value = null; }}>
          {p.name} {p.paths.includes(m.path) && <small>✓</small>}
        </button>
      ))}
      <button class="accent" onClick={() => {
        const name = prompt("New playlist name");
        if (name) createPlaylist(name, m.path);
        menu.value = null;
      }}>
        + New playlist…
      </button>
    </div>
  );
}
