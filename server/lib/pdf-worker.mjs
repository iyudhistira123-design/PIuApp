import { parentPort, workerData } from "node:worker_threads";
try {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
  });
  try {
    const result = await parser.getText({
      partial: Array.from({ length: 20 }, (_, i) => i + 1),
    });
    parentPort.postMessage({ text: result.text.slice(0, 20000) });
  } finally {
    await parser.destroy();
  }
} catch {
  parentPort.postMessage({
    error:
      "PDF tidak dapat dibaca. Gunakan PDF berisi teks atau ekspor halaman sebagai PNG.",
  });
}
