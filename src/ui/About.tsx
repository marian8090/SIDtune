import { showWelcome } from "../lib/prefs";
import { aboutOpen, docOpen } from "../state";
import { Logo } from "./Icons";

export function AboutDialog() {
  if (!aboutOpen.value) return null;
  const close = () => (aboutOpen.value = false);
  const open = (d: "manual" | "changelog") => {
    close();
    docOpen.value = d;
  };
  return (
    <div class="overlay" onClick={close}>
      <div class="dialog about-dialog" role="dialog" aria-label="About SIDtune" onClick={(e) => e.stopPropagation()}>
        <div class="about-brand">
          <Logo size={56} />
          <div>
            <h1>SIDtune</h1>
            <button class="link" onClick={() => open("changelog")}>
              Version {__APP_VERSION__}
            </button>
          </div>
        </div>
        <p>
          Commodore 64 music in your browser. SIDtune emulates the C64 and its SID sound chip cycle by cycle, plays the whole High Voltage SID
          Collection or your own files, and keeps your library, playlists and favorites on this device. Nothing is uploaded.
        </p>
        <div class="welcome-actions">
          <button class="btn" onClick={() => open("manual")}>
            User manual
          </button>
          <button class="btn" onClick={() => open("changelog")}>
            Version history
          </button>
        </div>
        <p class="hint credits">
          Music from the <a href="https://www.hvsc.c64.org/" target="_blank" rel="noreferrer">High Voltage SID Collection</a>; the tunes belong to
          their composers and are for private enjoyment. Emulation by libsidplayfp (reSIDfp and SIDLite). Inspired by{" "}
          <a href="https://ultrasid.com/" target="_blank" rel="noreferrer">ultraSID</a>, but an independent project. SIDtune is free software under
          the GPL-3.0. The Apple II and C64 fonts, Print Char 21 and Pet Me 64, are by{" "}
          <a href="https://www.kreativekorp.com/software/fonts/" target="_blank" rel="noreferrer">Kreative Korp</a>, used under their{" "}
          <a href="./fonts/Kreative-FreeLicense.txt" target="_blank" rel="noreferrer">free use licence</a>.
        </p>
        <div class="about-foot">
          <label class="check">
            <input type="checkbox" checked={showWelcome.value} onChange={(e) => (showWelcome.value = (e.currentTarget as HTMLInputElement).checked)} />
            Show this when SIDtune starts
          </label>
          <button class="btn primary" autoFocus onClick={close}>
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}
