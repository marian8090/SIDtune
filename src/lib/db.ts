import type { TuneMeta } from "./types";

let dbp: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("sidtune", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("meta", { keyPath: "path" });
      d.createObjectStore("files");
      d.createObjectStore("kv");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return wrap<T | undefined>(db.transaction("kv").objectStore("kv").get(key));
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await done(tx);
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").delete(key);
  await done(tx);
}

export async function allMeta(): Promise<TuneMeta[]> {
  const db = await open();
  return wrap<TuneMeta[]>(db.transaction("meta").objectStore("meta").getAll());
}

export async function putTunes(items: { meta: TuneMeta; data: ArrayBuffer }[]): Promise<void> {
  const db = await open();
  const tx = db.transaction(["meta", "files"], "readwrite");
  const meta = tx.objectStore("meta");
  const files = tx.objectStore("files");
  for (const { meta: m, data } of items) {
    meta.put(m);
    files.put(data, m.path);
  }
  await done(tx);
}

export async function getFile(path: string): Promise<ArrayBuffer | undefined> {
  const db = await open();
  return wrap<ArrayBuffer | undefined>(db.transaction("files").objectStore("files").get(path));
}

export async function clearLibrary(): Promise<void> {
  const db = await open();
  const tx = db.transaction(["meta", "files"], "readwrite");
  tx.objectStore("meta").clear();
  tx.objectStore("files").clear();
  await done(tx);
}

export async function putFile(path: string, data: ArrayBuffer): Promise<void> {
  const db = await open();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").put(data, path);
  await done(tx);
}

export async function putFiles(items: [path: string, data: ArrayBuffer][]): Promise<void> {
  const db = await open();
  const tx = db.transaction("files", "readwrite");
  const files = tx.objectStore("files");
  for (const [path, data] of items) files.put(data, path);
  await done(tx);
}

export async function fileKeys(): Promise<string[]> {
  const db = await open();
  return wrap(db.transaction("files").objectStore("files").getAllKeys()) as Promise<string[]>;
}
