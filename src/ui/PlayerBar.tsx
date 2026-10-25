import {
  current,
  duration,
  favoriteSet,
  formatTime,
  loading,
  next,
  nowPlayingOpen,
  playing,
  position,
  previous,
  seek,
  settings,
  setVolume,
  toggleFavorite,
  togglePlay,
  updateSettings,
} from "../state";
import { Expand, Heart, HeartOutline, Next, Pause, Play, Prev, Repeat, Shuffle, Volume } from "./Icons";
import { coverStyle, initials } from "./util";

export function PlayerBar() {
  const t = current.value;
  const s = settings.value;
  return (
    <footer class="playerbar">
      <button class="now" onClick={() => t && (nowPlayingOpen.value = true)} disabled={!t} aria-label="Open now playing">
        <div class="cover" style={coverStyle(t)}>
          {t ? initials(t) : "♪"}
        </div>
        <div class="meta">
          <b>{t ? t.title : "Nothing playing"}</b>
          <small>{t ? [t.author, t.released].filter(Boolean).join(" · ") : "Pick a tune to start"}</small>
        </div>
      </button>
      {t && (
        <button class={`icon-btn heart ${favoriteSet.value.has(t.path) ? "fav" : ""}`} title="Favorite" onClick={() => toggleFavorite(t.path)}>
          {favoriteSet.value.has(t.path) ? <Heart /> : <HeartOutline />}
        </button>
      )}

      <div class="transport">
        <div class="buttons">
          <button class={`icon-btn ${s.shuffle ? "on" : ""}`} title="Shuffle" onClick={() => updateSettings({ shuffle: !s.shuffle })}>
            <Shuffle />
          </button>
          <button class="icon-btn" title="Previous" onClick={previous}>
            <Prev />
          </button>
          <button class="play" title={playing.value ? "Pause" : "Play"} onClick={() => void togglePlay()}>
            {loading.value ? <span class="spin" /> : playing.value ? <Pause /> : <Play />}
          </button>
          <button class="icon-btn" title="Next" onClick={() => next()}>
            <Next />
          </button>
          <button
            class={`icon-btn ${s.repeat !== "off" ? "on" : ""}`}
            title={`Repeat: ${s.repeat}`}
            onClick={() => updateSettings({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })}
          >
            <Repeat />
            {s.repeat === "one" && <sup>1</sup>}
          </button>
        </div>
        <div class="seek">
          <span>{formatTime(position.value)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration.value)}
            step={1}
            value={Math.min(position.value, duration.value)}
            disabled={!t}
            aria-label="Seek"
            style={{ "--p": `${(Math.min(position.value, duration.value) / Math.max(1, duration.value)) * 100}%` }}
            onChange={(e) => seek(Number((e.currentTarget as HTMLInputElement).value))}
          />
          <span>{formatTime(duration.value)}</span>
        </div>
      </div>

      <div class="extras">
        <Volume />
        <input
          type="range"
          class="vol"
          min={0}
          max={1}
          step={0.01}
          value={s.volume}
          aria-label="Volume"
          style={{ "--p": `${s.volume * 100}%` }}
          onInput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <button class="icon-btn" title="Now playing" onClick={() => (nowPlayingOpen.value = !nowPlayingOpen.value)} disabled={!t}>
          <Expand />
        </button>
      </div>
    </footer>
  );
}
