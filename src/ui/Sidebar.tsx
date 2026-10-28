import { useState } from "preact/hooks";
import { aboutOpen, createPlaylist, deletePlaylist, docOpen, favorites, history, importProgress, playlists, renamePlaylist, settingsOpen, tunes, view, type View } from "../state";
import { Clock, Folder, Gear, Heart, Help, Info, Library, Logo, Plus, Trash } from "./Icons";
import { confirmDialog, promptDialog } from "./Ask";
import { useImportPickers } from "./Import";

export function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const { inputs, pickFolder, pickFiles } = useImportPickers();
  const [adding, setAdding] = useState(false);
  const progress = importProgress.value;

  const go = (v: View) => {
    view.value = v;
    close();
  };
  const item = (v: View, icon: preact.ComponentChild, label: string, count?: number) => (
    <button class={`nav-item ${view.value === v ? "active" : ""}`} onClick={() => go(v)}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <em>{count.toLocaleString()}</em>}
    </button>
  );

  return (
    <aside class={`sidebar ${open ? "open" : ""}`}>
      {inputs}
      <div class="brand">
        <Logo />
        <span>SIDtune</span>
        <button class="version" title="Version history" onClick={() => (docOpen.value = "changelog")}>
          v{__APP_VERSION__}
        </button>
      </div>

      <nav>
        {item("all", <Library />, "Library", tunes.value.length)}
        {item("favorites", <Heart />, "Favorites", favorites.value.length)}
        {item("history", <Clock />, "History", history.value.length)}
      </nav>

      <div class="nav-title">
        <span>Playlists</span>
        <button class="icon-btn" title="New playlist" onClick={() => setAdding(true)}>
          <Plus />
        </button>
      </div>
      <nav class="playlists">
        {adding && (
          <input
            class="input small"
            autoFocus
            placeholder="Playlist name"
            onBlur={() => setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
              if (e.key === "Enter") {
                const pl = createPlaylist((e.currentTarget as HTMLInputElement).value);
                setAdding(false);
                go(`pl:${pl.id}`);
              }
            }}
          />
        )}
        {playlists.value.map((p) => (
          <div key={p.id} class={`nav-item pl ${view.value === `pl:${p.id}` ? "active" : ""}`}>
            <button class="pl-main" onClick={() => go(`pl:${p.id}`)} onDblClick={async () => {
              const name = await promptDialog("Rename playlist", { value: p.name, ok: "Rename" });
              if (name) renamePlaylist(p.id, name);
            }}>
              <List />
              <span>{p.name}</span>
              <em>{p.paths.length}</em>
            </button>
            <button class="icon-btn danger" title="Delete playlist" onClick={async () => (await confirmDialog(`Delete “${p.name}”?`, { text: "The tunes stay in your library.", ok: "Delete", danger: true })) && deletePlaylist(p.id)}>
              <Trash />
            </button>
          </div>
        ))}
        {!playlists.value.length && !adding && <p class="hint">No playlists yet.</p>}
      </nav>

      <div class="sidebar-foot">
        {progress && (
          <div class="progress small">
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            <span>
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
          </div>
        )}
        <button class="nav-item" onClick={pickFolder} disabled={!!progress}>
          <Folder /> <span>Add folder</span>
        </button>
        <button class="nav-item" onClick={pickFiles} disabled={!!progress}>
          <Plus /> <span>Add files / zip</span>
        </button>
        <button class="nav-item" onClick={() => (settingsOpen.value = true)}>
          <Gear /> <span>Settings</span>
        </button>
        <div class="foot-row">
          <button class="nav-item" onClick={() => (docOpen.value = "manual")}>
            <Help /> <span>Help</span>
          </button>
          <button class="nav-item" onClick={() => (aboutOpen.value = true)}>
            <Info /> <span>About</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function List() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z" />
    </svg>
  );
}
