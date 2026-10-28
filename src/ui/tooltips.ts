import { effect } from "@preact/signals";
import { tooltips } from "../lib/prefs";

// Native tooltips come from title attributes, which Preact sets during renders. While tooltips are off, every title is moved
// to data-title as it appears (and becomes the aria-label when there is none, so icon buttons keep their accessible name).

function hide(el: Element) {
  const t = el.getAttribute("title");
  if (t === null) return;
  el.setAttribute("data-title", t);
  el.removeAttribute("title");
  if (!el.hasAttribute("aria-label") || el.hasAttribute("data-title-label")) {
    el.setAttribute("aria-label", t);
    el.setAttribute("data-title-label", "");
  }
}

function show(el: Element) {
  el.setAttribute("title", el.getAttribute("data-title")!);
  el.removeAttribute("data-title");
  if (el.hasAttribute("data-title-label")) {
    el.removeAttribute("aria-label");
    el.removeAttribute("data-title-label");
  }
}

const observer = new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === "attributes") hide(r.target as Element);
    else for (const n of r.addedNodes) if (n instanceof Element) [n, ...n.querySelectorAll("[title]")].forEach(hide);
  }
});

export function setupTooltips() {
  effect(() => {
    if (tooltips.value) {
      observer.disconnect();
      document.querySelectorAll("[data-title]").forEach(show);
    } else {
      document.querySelectorAll("[title]").forEach(hide);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    }
  });
}
