import { SonglengthDatabase } from "libsidplayfp-wasm";

export interface Songlengths {
  db: SonglengthDatabase;
  /** HVSC path -> md5, built from the "; /PATH.sid" comment lines. */
  pathToMd5: Map<string, string>;
}

export function parseSonglengths(text: string): Songlengths {
  const pathToMd5 = new Map<string, string>();
  let last = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(";")) {
      const p = line.slice(1).trim();
      if (p.startsWith("/")) last = p;
    } else if (last) {
      const eq = line.indexOf("=");
      if (eq === 32) pathToMd5.set(last, line.slice(0, 32));
      last = "";
    }
  }
  return { db: SonglengthDatabase.parse(text), pathToMd5 };
}

export function lengthForPath(sl: Songlengths | null, path: string, song: number): number | null {
  if (!sl) return null;
  const md5 = sl.pathToMd5.get(path);
  return md5 ? sl.db.lengthSeconds(md5, song) : null;
}
