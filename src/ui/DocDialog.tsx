import { useEffect, useState } from "preact/hooks";
import { markdownToHtml } from "../lib/markdown";
import { docOpen } from "../state";
import { Close } from "./Icons";

const DOCS = {
  manual: { title: "SIDtune manual", load: () => import("../../docs/MANUAL.md?raw") },
  changelog: { title: "Version history", load: () => import("../../CHANGELOG.md?raw") },
};

/** Shows the same page in a separate window so it can stay open beside the player. */
function openWindow(title: string, html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title><style>` +
      `body{margin:0 auto;max-width:760px;padding:24px 20px 48px;background:${v("--bg")};color:${v("--text")};font:15px/1.6 system-ui,sans-serif}` +
      `a{color:${v("--accent-strong")}}code{font:0.9em ui-monospace,monospace;background:rgba(127,127,127,.18);padding:1px 5px;border-radius:4px}` +
      `h1,h2,h3{line-height:1.25}h2{margin-top:2em}table{border-collapse:collapse}td,th{border-bottom:1px solid rgba(127,127,127,.3);padding:6px 12px 6px 0;text-align:left;vertical-align:top}` +
      `</style></head><body></body></html>`,
  );
  win.document.close();
  win.document.title = title;
  win.document.body.innerHTML = html;
}

export function DocDialog() {
  const which = docOpen.value;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(null);
    if (!which) return;
    let live = true;
    DOCS[which]
      .load()
      .then((m) => live && setHtml(markdownToHtml(m.default)))
      .catch(() => live && setHtml("<p>Could not load this page.</p>"));
    return () => {
      live = false;
    };
  }, [which]);

  if (!which) return null;
  const { title } = DOCS[which];
  const close = () => (docOpen.value = null);
  return (
    <div class="overlay" onClick={close}>
      <div class="dialog doc" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <div>
            {html && (
              <button class="link" onClick={() => openWindow(title, html)}>
                Open in new window
              </button>
            )}
            <button class="icon-btn" onClick={close} aria-label="Close">
              <Close />
            </button>
          </div>
        </header>
        {html ? <article class="doc-body" dangerouslySetInnerHTML={{ __html: html }} /> : <p class="hint">Loading…</p>}
      </div>
    </div>
  );
}
