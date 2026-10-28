import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface AskRequest {
  title: string;
  text?: string;
  /** Present for a text prompt: the initial value. */
  input?: string;
  ok: string;
  danger?: boolean;
  resolve: (v: string | null) => void;
}

const pending = signal<AskRequest | null>(null);

function open(r: Omit<AskRequest, "resolve">): Promise<string | null> {
  pending.value?.resolve(null);
  return new Promise((resolve) => (pending.value = { ...r, resolve }));
}

/** App-styled replacement for confirm(). */
export async function confirmDialog(title: string, opts: { text?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return (await open({ title, text: opts.text, ok: opts.ok ?? "OK", danger: opts.danger })) !== null;
}

/** App-styled replacement for prompt(). Resolves to the trimmed text, or null when cancelled or empty. */
export async function promptDialog(title: string, opts: { value?: string; ok?: string } = {}): Promise<string | null> {
  const v = await open({ title, input: opts.value ?? "", ok: opts.ok ?? "OK" });
  return v?.trim() || null;
}

export function AskDialog() {
  const r = pending.value;
  const input = useRef<HTMLInputElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!r) return;
    if (input.current) {
      input.current.focus();
      input.current.select();
    } else okBtn.current?.focus();
  }, [r]);

  if (!r) return null;
  const finish = (v: string | null) => {
    pending.value = null;
    r.resolve(v);
  };
  const ok = () => finish(input.current ? input.current.value : "");

  return (
    <div class="overlay ask-overlay" onClick={() => finish(null)}>
      <div class="dialog ask" role="alertdialog" aria-modal="true" aria-label={r.title} onClick={(e) => e.stopPropagation()}>
        <form
          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), finish(null))}
          onSubmit={(e) => {
            e.preventDefault();
            ok();
          }}
        >
          <h3>{r.title}</h3>
          {r.text && <p>{r.text}</p>}
          {r.input !== undefined && <input ref={input} class="input" value={r.input} />}
          <div class="dialog-actions">
            <button type="button" class="btn ghost" onClick={() => finish(null)}>
              Cancel
            </button>
            <button ref={okBtn} type="submit" class={`btn ${r.danger ? "danger-fill" : "primary"}`}>
              {r.ok}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
