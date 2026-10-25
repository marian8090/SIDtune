import { useRef } from "preact/hooks";
import { addTestTone, connectHvsc, hvscStatus, importItems, importProgress } from "../state";
import { itemsFromFiles } from "../lib/importer";
import { Folder, Plus } from "./Icons";

/** Hidden inputs plus a small chooser, shared by the sidebar and the welcome screen. */
export function useImportPickers() {
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const onPick = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const list = [...(input.files ?? [])];
    input.value = "";
    void importItems(itemsFromFiles(list));
  };
  const inputs = (
    <>
      <input ref={folder} type="file" hidden multiple onChange={onPick} {...({ webkitdirectory: "", directory: "" } as object)} />
      <input ref={files} type="file" hidden multiple accept=".sid,.zip,.md5,.txt" onChange={onPick} />
    </>
  );
  return { inputs, pickFolder: () => folder.current?.click(), pickFiles: () => files.current?.click() };
}

export function Welcome() {
  const { inputs, pickFolder, pickFiles } = useImportPickers();
  const progress = importProgress.value;
  return (
    <div class="welcome">
      {inputs}
      <div class="welcome-card">
        <h1>Welcome to SIDtune</h1>
        {hvscStatus.value.state === "error" && (
          <p class="notice">
            {hvscStatus.value.text} <button class="link" onClick={() => void connectHvsc(true)}>Retry</button>
          </p>
        )}
        <p>
          Play Commodore 64 music right here in your browser. SIDtune runs a cycle-accurate C64 and SID chip emulation, and keeps your
          tunes on this device only.
        </p>
        <ol>
          <li>
            Get the <a href="https://www.hvsc.c64.org/" target="_blank" rel="noreferrer">High Voltage SID Collection</a> and unpack it.
          </li>
          <li>Pick the <b>C64Music</b> folder below, or drop it anywhere on this page.</li>
          <li>Optionally include <code>DOCUMENTS/Songlengths.md5</code> and <code>STIL.txt</code> for track lengths and notes.</li>
        </ol>
        <div class="welcome-actions">
          <button class="btn primary" onClick={pickFolder} disabled={!!progress}>
            <Folder /> Choose a folder
          </button>
          <button class="btn" onClick={pickFiles} disabled={!!progress}>
            <Plus /> Add .sid files or a .zip
          </button>
          <button class="btn ghost" onClick={() => void addTestTone()} disabled={!!progress}>
            Try a test tone
          </button>
        </div>
        {progress && (
          <div class="progress">
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            <span>
              Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
          </div>
        )}
        <small>Large collections take a minute or two to import the first time. Nothing is uploaded anywhere.</small>
      </div>
    </div>
  );
}
