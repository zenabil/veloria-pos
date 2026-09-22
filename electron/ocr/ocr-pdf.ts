// Veloria PoS — Electron OCR: extraction du texte des PDF (100 % locale).
// pdfjs-dist en fil principal (extraction texte seule, sans canvas) : rapide,
// sans dépendance native. Un PDF SANS couche texte (pages scannées) est
// signalé explicitement — la rastérisation exigerait un canvas natif.

import fs from "node:fs";

export const OCR_MAX_PDF_PAGES = 20;
// P11: même garde temporelle que les images (miroir OCR_TIMEOUT_MS) —
// un PDF malformé ne doit jamais bloquer le canal IPC indéfiniment.
export const OCR_PDF_TIMEOUT_MS = 60_000;
// P11: texte total borné (20 pages denses → réponse IPC maîtrisée).
export const OCR_MAX_PDF_CHARS = 200_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export interface OcrPdfPage {
  index: number;
  text: string;
  hasText: boolean;
}

export interface OcrPdfInfo {
  pageCount: number;
  pages: OcrPdfPage[];
}

interface PdfJsItem {
  str?: unknown;
}

interface PdfJsTextContent {
  items: PdfJsItem[];
}

interface PdfJsPage {
  getTextContent(): Promise<PdfJsTextContent>;
}

interface PdfJsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  cleanup(): Promise<unknown>;
}

/** Texte brut de chaque page (marqueur de page conservé pour l'audit). */
export async function extractPdfText(pdfPath: string): Promise<OcrPdfInfo> {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(pdfPath);
  } catch {
    throw new Error("PDF illisible.");
  }
  let pdfjs: {
    getDocument: (opts: { data: Uint8Array; useSystemFonts?: boolean }) => {
      promise: Promise<PdfJsDocument>;
    };
  };
  try {
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
      getDocument: (opts: { data: Uint8Array; useSystemFonts?: boolean }) => {
        promise: Promise<PdfJsDocument>;
      };
    };
  } catch {
    throw new Error("Lecteur PDF indisponible : réinstallez Veloria PoS.");
  }
  let doc: PdfJsDocument;
  try {
    doc = await withTimeout(
      pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise,
      OCR_PDF_TIMEOUT_MS,
      "PDF trop long à analyser : document rejeté.",
    );
  } catch (err) {
    if (err instanceof Error && /trop long/.test(err.message)) throw err;
    throw new Error("PDF invalide ou protégé : extraction impossible.");
  }
  try {
    if (!Number.isInteger(doc.numPages) || doc.numPages < 1) {
      throw new Error("PDF invalide ou protégé : extraction impossible.");
    }
    if (doc.numPages > OCR_MAX_PDF_PAGES) {
      throw new Error(`PDF trop long : ${OCR_MAX_PDF_PAGES} pages maximum.`);
    }
    const pages: OcrPdfPage[] = [];
    let totalChars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      let content: PdfJsTextContent;
      try {
        content = await withTimeout(
          (await doc.getPage(i)).getTextContent(),
          OCR_PDF_TIMEOUT_MS,
          `Lecture impossible de la page ${i} (délai dépassé).`,
        );
      } catch (err) {
        if (err instanceof Error && /délai/.test(err.message)) throw err;
        throw new Error(`Lecture impossible de la page ${i}.`);
      }
      const text = content.items
        .map((it) => (typeof it.str === "string" ? it.str : ""))
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      totalChars += text.length;
      if (totalChars > OCR_MAX_PDF_CHARS) {
        throw new Error("PDF trop volumineux : texte extrait au-delà de la limite.");
      }
      pages.push({ index: i, text, hasText: text.length > 0 });
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    try {
      await doc.cleanup();
    } catch {
      /* meilleur effort */
    }
  }
}
