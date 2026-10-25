/** Parses HVSC's STIL.txt into path -> notes. Directory entries (trailing "/") are skipped. */
export function parseStil(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let path = "";
  let lines: string[] = [];
  const flush = () => {
    if (path && !path.endsWith("/") && lines.length) map.set(path, lines.join("\n").trimEnd());
    path = "";
    lines = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("#")) continue;
    if (raw.startsWith("/")) {
      flush();
      path = raw.trim();
    } else if (raw.trim() === "") {
      flush();
    } else if (path) {
      lines.push(raw);
    }
  }
  flush();
  return map;
}
