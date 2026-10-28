import type { AudioFormat, ExportJob, ExportReply } from "./export.worker";

export type { AudioFormat };

/** Renders and encodes a tune in a throwaway worker. */
export function exportAudio(job: ExportJob, onProgress: (stage: "render" | "encode", fraction: number) => void): Promise<Blob> {
  const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ExportReply>) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.stage, m.fraction);
      else if (m.type === "done") resolve(m.blob);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage(job, [job.data]);
  }).finally(() => worker.terminate());
}
