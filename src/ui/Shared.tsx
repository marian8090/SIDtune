import { nowPlayingOpen, playFromList, sharedTune } from "../state";
import { Play } from "./Icons";
import { coverStyle, initials } from "./util";

/** Offers the tune from a shared link; the tap on Play is what lets the browser start audio. */
export function SharedDialog() {
  const s = sharedTune.value;
  if (!s) return null;
  const { meta } = s;
  const close = () => (sharedTune.value = null);
  return (
    <div class="overlay" onClick={close}>
      <div class="dialog ask shared" role="dialog" aria-label="Shared tune" onClick={(e) => e.stopPropagation()}>
        <small>Someone shared a tune with you</small>
        <div class="shared-tune">
          <div class="cover" style={coverStyle(meta)}>
            {initials(meta)}
          </div>
          <div class="meta">
            <b>{meta.title}</b>
            <small>{[meta.author, meta.released].filter(Boolean).join(" · ")}</small>
            {s.song !== null && <small>Subtune {s.song + 1}</small>}
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn ghost" onClick={close}>
            Not now
          </button>
          <button
            class="btn primary"
            autoFocus
            onClick={() => {
              playFromList(meta.path, s.song);
              nowPlayingOpen.value = true;
              close();
            }}
          >
            <Play /> Play
          </button>
        </div>
      </div>
    </div>
  );
}
