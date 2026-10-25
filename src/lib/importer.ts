import { unzip } from "fflate";
import { putTunes, kvSet } from "./db";
import { parsePsid } from "./psid";
import type { TuneMeta } from "./types";

export interface ImportItem {
  /** Path as given by the browser/zip, without normalisation. */
  rawPath: string;
  read(): Promise<ArrayBuffer>;
}

export interface ImportResult {
  tunes: TuneMeta[];
  songlengths?: string;
  stil?: string;
  skipped: number;
}

/** Maps a picked path to the HVSC-style path ("/MUSICIANS/...") used for Songlengths/STIL lookups. */
export function normalisePath(raw: string): string {
  const p = raw.replace(/\\/g, "/");
  const m = p.match(/(?:^|\/)c64music\/(.*)$/i);
  if (m) return "/" + m[1];
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 1) parts.shift(); // picked folder's own name
  return "/" + parts.join("/");
}

const decoder = new TextDecoder("latin1");

export async function runImport(
  items: ImportItem[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { tunes: [], skipped: 0 };
  const total = items.length;
  let done = 0;
  const BATCH = 200;

  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const batch: { meta: TuneMeta; data: ArrayBuffer }[] = [];
    await Promise.all(
      slice.map(async (item) => {
        const name = item.rawPath.split(/[\\/]/).pop()!.toLowerCase();
        try {
          if (name.endsWith(".sid")) {
            const data = await item.read();
            const meta = parsePsid(data, normalisePath(item.rawPath));
            if (meta) batch.push({ meta, data });
            else result.skipped++;
          } else if (name === "songlengths.md5") {
            result.songlengths = decoder.decode(await item.read());
          } else if (name === "stil.txt") {
            result.stil = decoder.decode(await item.read());
          } else {
            result.skipped++;
          }
        } catch {
          result.skipped++;
        }
      }),
    );
    if (batch.length) {
      await putTunes(batch);
      for (const b of batch) result.tunes.push(b.meta);
    }
    done += slice.length;
    onProgress(done, total);
    await new Promise((r) => setTimeout(r));
  }
  if (result.songlengths) await kvSet("songlengths", result.songlengths);
  if (result.stil) await kvSet("stil", result.stil);
  return result;
}

export function itemsFromFiles(files: File[]): ImportItem[] {
  const out: ImportItem[] = [];
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    out.push({ rawPath: rel, read: () => f.arrayBuffer() });
  }
  return out;
}

/** Expands any .zip items into their .sid / songlength / STIL members. */
export async function expandZips(items: ImportItem[]): Promise<ImportItem[]> {
  const out: ImportItem[] = [];
  for (const item of items) {
    if (!/\.zip$/i.test(item.rawPath)) {
      out.push(item);
      continue;
    }
    const bytes = new Uint8Array(await item.read());
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
      unzip(
        bytes,
        { filter: (f) => /\.sid$|songlengths\.md5$|stil\.txt$/i.test(f.name) },
        (err, data) => (err ? reject(err) : resolve(data)),
      ),
    );
    for (const [name, data] of Object.entries(entries)) {
      const copy = data.slice().buffer;
      out.push({ rawPath: name, read: async () => copy });
    }
  }
  return out;
}

/** Walks a drag-and-dropped DataTransfer, including folders. */
export async function itemsFromDrop(dt: DataTransfer): Promise<ImportItem[]> {
  const out: ImportItem[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ rawPath: prefix + entry.name, read: () => file.arrayBuffer() });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const children = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!children.length) break;
        for (const c of children) await walk(c, prefix + entry.name + "/");
      }
    }
  };
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (entries.length) for (const e of entries) await walk(e, "");
  else for (const f of dt.files) out.push({ rawPath: f.name, read: () => f.arrayBuffer() });
  return out;
}
