// @vitest-environment node

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  extractPdfText,
  PDF_NO_TEXT_MESSAGE,
  PDF_TOO_LARGE_MESSAGE,
  PDF_UNREADABLE_MESSAGE,
} from "./pdfText.js";

async function pdfWithPages(lines: string[]): Promise<ArrayBuffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = document.addPage();
    if (line) {
      page.drawText(line, { x: 50, y: 700, size: 18, font });
    }
  }
  const bytes = await document.save();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

beforeAll(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs")
  ).href;
});

describe("extractPdfText", () => {
  it("returns selectable text with a blank line between pages", async () => {
    const pdf = await pdfWithPages(["First page", "Second page"]);

    await expect(extractPdfText(pdf)).resolves.toBe("First page\n\nSecond page");
  });

  it("rejects a PDF that has no selectable text", async () => {
    const pdf = await pdfWithPages([""]);

    await expect(extractPdfText(pdf)).rejects.toThrow(PDF_NO_TEXT_MESSAGE);
  });

  it("rejects a file that is not a PDF", async () => {
    const pdf = new TextEncoder().encode("not a pdf").buffer;

    await expect(extractPdfText(pdf)).rejects.toThrow(PDF_UNREADABLE_MESSAGE);
  });

  it("rejects a PDF larger than 20 MB before reading it", async () => {
    const pdf = new ArrayBuffer(20 * 1024 * 1024 + 1);

    await expect(extractPdfText(pdf)).rejects.toThrow(PDF_TOO_LARGE_MESSAGE);
  });
});
