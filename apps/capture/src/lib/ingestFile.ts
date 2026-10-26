import { extractPdfText, PDF_UNREADABLE_MESSAGE } from "./pdfText.js";

function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error(PDF_UNREADABLE_MESSAGE));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(PDF_UNREADABLE_MESSAGE));
    };
    reader.readAsArrayBuffer(file);
  });
}

export const CAPTURE_FILE_ACCEPT =
  "application/pdf,.pdf,text/plain,.txt,.md,.markdown";

export function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") || /\.(m4a|mp3|wav|aac|ogg)$/i.test(file.name)
  );
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isTextFile(file: File): boolean {
  return file.type.startsWith("text/") || /\.(txt|md|markdown)$/i.test(file.name);
}

export async function readCaptureFile(file: File): Promise<
  | { ok: true; text: string; source: "pdf" | "text" }
  | { ok: false; message: string }
> {
  if (isAudioFile(file)) {
    return {
      ok: false,
      message:
        "Use the microphone to dictate. Audio files are not transcribed in this browser.",
    };
  }
  if (isPdfFile(file)) {
    try {
      const text = await extractPdfText(await readFileBytes(file));
      return { ok: true, text, source: "pdf" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : PDF_UNREADABLE_MESSAGE,
      };
    }
  }
  if (isTextFile(file)) {
    return { ok: true, text: await file.text(), source: "text" };
  }
  return { ok: false, message: "Use a PDF, text file, or the microphone." };
}
