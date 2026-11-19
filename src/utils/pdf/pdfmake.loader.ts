import type { TFontDictionary } from "pdfmake/interfaces";

interface PdfMakeRuntime {
  createPdf: typeof import("pdfmake").createPdf;
  setFonts: (fonts: TFontDictionary) => void;
  setUrlAccessPolicy: (policy: (url: string) => boolean) => void;
  setLocalAccessPolicy: (policy: (path: string) => boolean) => void;
}

let runtimePromise: Promise<PdfMakeRuntime> | undefined;

/** Memuat pdfmake dan font hanya saat handler ekspor meminta runtime server. */
export function loadPdfMake(): Promise<PdfMakeRuntime> {
  runtimePromise ??= initializePdfMake();
  return runtimePromise;
}

async function initializePdfMake(): Promise<PdfMakeRuntime> {
  const [pdfModule, fontModule] = await Promise.all([
    import("pdfmake"),
    import("pdfmake/fonts/Roboto.js"),
  ]);
  const pdfmake = (pdfModule as unknown as { default: PdfMakeRuntime }).default;
  const fonts = (fontModule as unknown as { default: TFontDictionary }).default;
  const allowedFontPaths = collectFontPaths(fonts);
  pdfmake.setFonts(fonts);
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((path) => allowedFontPaths.has(path));
  return pdfmake;
}

function collectFontPaths(fonts: TFontDictionary): Set<string> {
  const paths = Object.values(fonts.Roboto ?? {}).filter(
    (fontPath): fontPath is string => typeof fontPath === "string",
  );
  return new Set(paths);
}
