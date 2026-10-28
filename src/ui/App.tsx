import { useEffect, useState } from "preact/hooks";
import { itemsFromDrop } from "../lib/importer";
import { touchDevice } from "../lib/types";
import { cycleTheme, showWelcome, theme, THEMES } from "../lib/prefs";
import {
  aboutOpen,
  boot,
  booted,
  current,
  details,
  docOpen,
  hvscStatus,
  importItems,
  message,
  next,
  nowPlayingOpen,
  openedFromLink,
  position,
  previous,
  query,
  seek,
  selectSong,
  settings,
  settingsOpen,
  setVolume,
  shareCurrent,
  sharedTune,
  soundMenuOpen,
  toggleFavorite,
  togglePlay,
  tunes,
  view,
} from "../state";
import { AboutDialog } from "./About";
import { AskDialog } from "./Ask";
import { DocDialog } from "./DocDialog";
import { Menu, Search } from "./Icons";
import { Welcome } from "./Import";
import { NowPlaying } from "./NowPlaying";
import { PlayerBar } from "./PlayerBar";
import { SettingsDialog } from "./SettingsDialog";
import { SoundMenu } from "./SoundMenu";
import { SharedDialog } from "./Shared";
import { Sidebar } from "./Sidebar";
import { TrackList } from "./TrackList";

const TITLES: Record<string, string> = { all: "Library", favorites: "Favorites", history: "History" };

export function App() {
  const [nav, setNav] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    void boot().then(() => {
      if (showWelcome.value && !openedFromLink) aboutOpen.value = true;
    });
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && (k === "e" || k === ",")) {
        e.preventDefault();
        if (k === "e") soundMenuOpen.value = !soundMenuOpen.value;
        else settingsOpen.value = !settingsOpen.value;
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.matches("input:not([type=range]):not([type=checkbox]),textarea,select")) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      const t = current.value;
      if (e.key === " ") {
        e.preventDefault();
        void togglePlay();
      } else if (e.key === "ArrowRight") e.shiftKey ? next() : seek(position.value + 10);
      else if (e.key === "ArrowLeft") e.shiftKey ? previous() : seek(position.value - 10);
      else if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
      } else if (e.key === "?") docOpen.value = docOpen.value === "manual" ? null : "manual";
      else if (k === "t") {
        cycleTheme(e.shiftKey ? -1 : 1);
        message.value = `Theme: ${THEMES.find((x) => x.id === theme.value)!.label}`;
      } else if (k === "n" && t) nowPlayingOpen.value = !nowPlayingOpen.value;
      else if (k === "f" && t) toggleFavorite(t.path);
      else if (k === "l" && t) void shareCurrent();
      else if (e.key === "+" || e.key === "=") setVolume(Math.min(1, settings.value.volume + 0.05));
      else if (e.key === "-") setVolume(Math.max(0, settings.value.volume - 0.05));
      else if (/^[1-9]$/.test(e.key) && t && Number(e.key) <= (details.value?.songs ?? t.songs)) selectSong(Number(e.key) - 1);
      else if (e.key === "Escape") {
        if (docOpen.value) docOpen.value = null;
        else if (aboutOpen.value) aboutOpen.value = false;
        else if (sharedTune.value) sharedTune.value = null;
        else if (settingsOpen.value) settingsOpen.value = false;
        else {
          nowPlayingOpen.value = false;
          soundMenuOpen.value = false;
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!message.value) return;
    const t = setTimeout(() => (message.value = null), 5000);
    return () => clearTimeout(t);
  }, [message.value]);

  if (!booted.value) return <div class="boot">Loading…</div>;
  const empty = tunes.value.length === 0;
  const title = TITLES[view.value] ?? "Playlist";

  return (
    <div
      class={`app ${nowPlayingOpen.value ? "np-open" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer) void importItems(await itemsFromDrop(e.dataTransfer));
      }}
    >
      <Sidebar open={nav} close={() => setNav(false)} />
      {nav && <div class="scrim" onClick={() => setNav(false)} />}
      <main>
        {empty && hvscStatus.value.state === "loading" ? (
          <div class="welcome">
            <div class="welcome-card">
              <h1>SIDtune</h1>
              <div class="progress"><div style={{ width: "100%" }} class="indeterminate" /><span>{hvscStatus.value.text}</span></div>
            </div>
          </div>
        ) : empty ? (
          <Welcome />
        ) : (
          <>
            <div class="topbar">
              <button class="icon-btn menu" onClick={() => setNav(true)} aria-label="Menu">
                <Menu />
              </button>
              <h1>{view.value.startsWith("pl:") ? "Playlist" : title}</h1>
              <label class="search">
                <Search />
                <input placeholder={touchDevice ? "Search title, composer or year" : "Search title, composer or year  ( / )"} value={query.value} onInput={(e) => (query.value = (e.currentTarget as HTMLInputElement).value)} />
              </label>
            </div>
            <TrackList />
          </>
        )}
      </main>
      <NowPlaying />
      <PlayerBar />
      <SoundMenu />
      <SettingsDialog />
      <AboutDialog />
      <DocDialog />
      <SharedDialog />
      <AskDialog />
      {message.value && <div class="toast" role="status">{message.value}</div>}
      {drag && <div class="dropzone">Drop SID files, a folder or a zip to add them</div>}
    </div>
  );
}
