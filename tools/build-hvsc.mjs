#!/usr/bin/env node
// Builds the server-side HVSC catalogue SIDtune can browse and stream from.
//
//   node tools/build-hvsc.mjs /path/to/C64Music [outDir=hvsc-build]
//
// Output (all static files, host them anywhere that supports HTTP Range requests):
//   manifest.json          tiny, always revalidated; points at the versioned files below
//   index.<hash>.json      one row per tune: metadata, song lengths, location inside a pack
//   stil.<hash>.txt        HVSC's STIL notes
//   pack-<ver>-NNN.bin     the .sid files concatenated; the index says where each one starts
//
// Requires Node >= 22.18 (runs the shared TypeScript PSID parser directly).
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parsePsid } from "../src/lib/psid.ts";

const PART_LIMIT = 90 * 1024 * 1024;
const [root, outArg = "hvsc-build"] = process.argv.slice(2);
if (!root) {
  console.error("usage: node tools/build-hvsc.mjs /path/to/C64Music [outDir]");
  process.exit(1);
}
const base = resolve(root);
const out = resolve(outArg);

async function* walk(dir) {
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.sid$/i.test(e.name)) yield p;
  }
}

function parseTime(t) {
  const m = /^(\d+):(\d+)(?:\.(\d+))?/.exec(t);
  if (!m) return null;
  const frac = m[3] ? Number(`0.${m[3]}`) : 0;
  return Math.round((Number(m[1]) * 60 + Number(m[2]) + frac) * 10) / 10;
}

async function readSonglengths() {
  const text = await readFile(join(base, "DOCUMENTS", "Songlengths.md5"), "latin1");
  const map = new Map();
  let path = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(";")) {
      const p = line.slice(1).trim();
      if (p.startsWith("/")) path = p;
    } else if (path && line.length > 33 && line[32] === "=") {
      const lens = line.slice(33).trim().split(/\s+/).map(parseTime);
      if (lens.every((x) => x !== null)) map.set(path, lens);
      path = "";
    }
  }
  return map;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const stilText = await readFile(join(base, "DOCUMENTS", "STIL.txt"));
const version = /STIL v(\d+)/.exec(stilText.subarray(0, 600).toString("latin1"))?.[1] ?? "unknown";
const lengths = await readSonglengths();
console.log(`HVSC v${version}: ${lengths.size.toLocaleString()} song-length entries`);

const parts = [];
let stream = null;
let partSize = 0;
const partName = (i) => `pack-${version}-${String(i).padStart(3, "0")}.bin`;
const write = (buf) => new Promise((res, rej) => stream.write(buf, (e) => (e ? rej(e) : res())));
async function closePart() {
  if (!stream) return;
  await new Promise((res) => stream.end(res));
  parts[parts.length - 1].size = partSize;
}
async function openPart() {
  await closePart();
  parts.push({ name: partName(parts.length), size: 0 });
  stream = createWriteStream(join(out, parts.at(-1).name));
  partSize = 0;
}

const rows = [];
let skipped = 0;
let missingLen = 0;
for await (const file of walk(base)) {
  const buf = await readFile(file);
  const path = "/" + relative(base, file).split(sep).join("/");
  const m = parsePsid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path);
  if (!m) {
    skipped++;
    continue;
  }
  if (!stream || partSize + buf.length > PART_LIMIT) await openPart();
  const offset = partSize;
  await write(buf);
  partSize += buf.length;
  const len = lengths.get(path);
  if (!len) missingLen++;
  rows.push([path, m.title, m.author, m.released, m.format === "RSID" ? 1 : 0, m.version, m.songs, m.startSong, m.sids, m.sidModel, m.clock, m.size, parts.length - 1, offset, len ?? []]);
}
await closePart();

const index = {
  format: 1,
  hvsc: version,
  built: new Date().toISOString(),
  parts: parts.map((p) => p.name),
  cols: ["path", "title", "author", "released", "rsid", "version", "songs", "startSong", "sids", "sidModel", "clock", "size", "part", "offset", "lengths"],
  rows,
};
const indexJson = JSON.stringify(index);
const hash = (b) => createHash("sha256").update(b).digest("hex").slice(0, 10);
const indexName = `index.${hash(indexJson)}.json`;
const stilName = `stil.${hash(stilText)}.txt`;
await writeFile(join(out, indexName), indexJson);
await writeFile(join(out, stilName), stilText);
await writeFile(
  join(out, "manifest.json"),
  JSON.stringify({ format: 1, hvsc: version, built: index.built, count: rows.length, index: indexName, stil: stilName, parts }, null, 2),
);

const mb = (n) => (n / 1048576).toFixed(1) + " MB";
console.log(`${rows.length.toLocaleString()} tunes (${skipped} skipped, ${missingLen} without a known length)`);
console.log(`${indexName}: ${mb(Buffer.byteLength(indexJson))}, ${parts.length} pack file(s): ${mb(parts.reduce((a, p) => a + p.size, 0))}`);
console.log(`Written to ${out}`);
