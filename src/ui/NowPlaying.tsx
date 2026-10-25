import {
  current,
  details,
  exportCurrentWav,
  favoriteSet,
  nowPlayingOpen,
  playlists,
  addToPlaylist,
  selectSong,
  song,
  stilFor,
  toggleFavorite,
  toggleVoice,
  voiceMuted,
  lengthKnown,
} from "../state";
import { Close, Download, Heart, HeartOutline } from "./Icons";
import { Viz } from "./Viz";
import { coverStyle, describe, initials } from "./util";

export function NowPlaying() {
  const t = current.value;
  if (!nowPlayingOpen.value || !t) return null;
  const d = details.value;
  const note = stilFor(t.path);
  const songs = d?.songs ?? t.songs;
  const muted = voiceMuted.value;

  return (
    <section class="nowplaying" aria-label="Now playing">
      <header>
        <h2>Now playing</h2>
        <button class="icon-btn" onClick={() => (nowPlayingOpen.value = false)} aria-label="Close">
          <Close />
        </button>
      </header>
      <div class="np-body">
        <div class="np-cover" style={coverStyle(t)}>
          {initials(t)}
        </div>
        <h3>{t.title}</h3>
        <p class="np-author">{t.author}</p>
        <p class="np-rel">{t.released}</p>
        <p class="tags">
          {describe(t)}
          {!lengthKnown.value && " · length unknown, using default"}
        </p>

        <Viz />

        <div class="voices">
          {[1, 2, 3].map((n, v) => (
            <button key={n} class={`chip ${muted[v] ? "off" : ""}`} onClick={() => toggleVoice(v)} title={muted[v] ? "Unmute voice" : "Mute voice"}>
              Voice {n}
            </button>
          ))}
        </div>

        {songs > 1 && (
          <div class="subtunes">
            <h4>Subtunes</h4>
            <div class="chips">
              {Array.from({ length: songs }, (_, i) => (
                <button key={i} class={`chip ${song.value === i ? "on" : ""}`} onClick={() => selectSong(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="np-actions">
          <button class="btn" onClick={() => toggleFavorite(t.path)}>
            {favoriteSet.value.has(t.path) ? <Heart /> : <HeartOutline />} Favorite
          </button>
          <button class="btn" onClick={() => void exportCurrentWav()}>
            <Download /> Export WAV
          </button>
          {playlists.value.length > 0 && (
            <select
              class="input"
              value=""
              aria-label="Add to playlist"
              onChange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                if (id) addToPlaylist(id, t.path);
                (e.currentTarget as HTMLSelectElement).value = "";
              }}
            >
              <option value="">Add to playlist…</option>
              {playlists.value.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {note && (
          <div class="stil">
            <h4>STIL</h4>
            <pre>{note}</pre>
          </div>
        )}
        <p class="path">{t.path}</p>
      </div>
    </section>
  );
}
