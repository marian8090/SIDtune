import type { TuneMeta } from "./types";

let dbp: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    const r = indexedDB.open("sidtune", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("meta", { keyPath: "path" });
      d.createObjectStore("files");
      d.createObjectStore("kv");
    };
    r.onsuccess = () => {
      const d = r.result;
      const forget = () => {
        if (dbp === p) dbp = undefined;
      };
      d.onclose = forget;
      d.onversionchange = () => {
        forget();
        d.close();
      };
      resolve(d);
    };
    r.onerror = () => {
      if (dbp === p) dbp = undefined;
      reject(r.error);
    };
  });
  return (dbp = p);
}

/** The browser may close the connection behind our back (Safari does after the tab sleeps), so reopen once on InvalidStateError. */
async function transaction(stores: string | string[], mode: IDBTransactionMode = "readonly"): Promise<IDBTransaction> {
  try {
    return (await open()).transaction(stores, mode);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "InvalidStateError")) throw err;
    dbp = undefined;
    return (await open()).transaction(stores, mode);
  }
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
  return wrap<T | undefined>((await transaction("kv")).objectStore("kv").get(key));
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const tx = await transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await done(tx);
}

export async function kvDelete(key: string): Promise<void> {
  const tx = await transaction("kv", "readwrite");
  tx.objectStore("kv").delete(key);
  await done(tx);
}

export async function allMeta(): Promise<TuneMeta[]> {
  return wrap<TuneMeta[]>((await transaction("meta")).objectStore("meta").getAll());
}

export async function putTunes(items: { meta: TuneMeta; data: ArrayBuffer }[]): Promise<void> {
  const tx = await transaction(["meta", "files"], "readwrite");
  const meta = tx.objectStore("meta");
  const files = tx.objectStore("files");
  for (const { meta: m, data } of items) {
    meta.put(m);
    files.put(data, m.path);
  }
  await done(tx);
}

export async function getFile(path: string): Promise<ArrayBuffer | undefined> {
  return wrap<ArrayBuffer | undefined>((await transaction("files")).objectStore("files").get(path));
}

export async function clearLibrary(): Promise<void> {
  const tx = await transaction(["meta", "files"], "readwrite");
  tx.objectStore("meta").clear();
  tx.objectStore("files").clear();
  await done(tx);
}

export async function putFile(path: string, data: ArrayBuffer): Promise<void> {
  const tx = await transaction("files", "readwrite");
  tx.objectStore("files").put(data, path);
  await done(tx);
}

export async function putFiles(items: [path: string, data: ArrayBuffer][]): Promise<void> {
  const tx = await transaction("files", "readwrite");
  const files = tx.objectStore("files");
  for (const [path, data] of items) files.put(data, path);
  await done(tx);
}

export async function fileKeys(): Promise<string[]> {
  return wrap((await transaction("files")).objectStore("files").getAllKeys()) as Promise<string[]>;
}
