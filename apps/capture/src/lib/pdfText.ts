async function openPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
    );
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 });
}

export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_TOO_LARGE_MESSAGE = "Choose a PDF under 20 MB.";
export const PDF_UNREADABLE_MESSAGE = "Could not read that PDF.";
export const PDF_NO_TEXT_MESSAGE = "This PDF has no selectable text.";

type PdfTextItem = {
  str: string;
  hasEOL: boolean;
  transform: number[];
};

function toPdfTextItem(item: unknown): PdfTextItem | undefined {
  if (typeof item !== "object" || item === null || !("str" in item)) {
    return undefined;
  }
  const candidate = item as {
    str?: unknown;
    hasEOL?: unknown;
    transform?: unknown;
  };
  if (typeof candidate.str !== "string" || !Array.isArray(candidate.transform)) {
    return undefined;
  }
  return {
    str: candidate.str,
    hasEOL: candidate.hasEOL === true,
    transform: candidate.transform.filter(
      (value): value is number => typeof value === "number"
    ),
  };
}

function pageText(items: PdfTextItem[]): string {
  const lines: string[] = [];
  let line = "";
  let lineY: number | undefined;

  for (const item of items) {
    const y = item.transform[5];
    if (lineY !== undefined && y !== lineY) {
      lines.push(line.trim());
      line = "";
    }
    lineY = y;
    if (line && !line.endsWith(" ") && !item.str.startsWith(" ")) {
      line += " ";
    }
    line += item.str;
    if (item.hasEOL) {
      lines.push(line.trim());
      line = "";
      lineY = undefined;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.filter((entry) => entry.length > 0).join("\n");
}

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  if (data.byteLength > PDF_MAX_BYTES) {
    throw new Error(PDF_TOO_LARGE_MESSAGE);
  }

  const loadingTask = await openPdf(data);
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch {
    throw new Error(PDF_UNREADABLE_MESSAGE);
  }

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageText(
        content.items.flatMap((item) => {
          const textItem = toPdfTextItem(item);
          return textItem ? [textItem] : [];
        })
      );
      if (text) pages.push(text);
    }
    if (pages.length === 0) {
      throw new Error(PDF_NO_TEXT_MESSAGE);
    }
    return pages.join("\n\n");
  } catch (error) {
    if (error instanceof Error && error.message === PDF_NO_TEXT_MESSAGE) {
      throw error;
    }
    throw new Error(PDF_UNREADABLE_MESSAGE);
  } finally {
    await loadingTask.destroy();
  }
}
