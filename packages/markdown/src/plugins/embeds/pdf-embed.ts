import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

type PdfiumRuntime = WrappedPdfiumModule["pdfium"] & { HEAPU8: Uint8Array };

export interface PdfEmbedParams {
  readonly page: number;
  readonly height?: number;
}

export interface RenderedPdfPage {
  readonly pageCount: number;
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

function resolveHeightParam(
  rawHeight: number,
  fallbackHeight?: number,
): number | undefined {
  if (Number.isFinite(rawHeight) && rawHeight > 0) {
    return rawHeight;
  }
  if (
    fallbackHeight !== undefined &&
    Number.isFinite(fallbackHeight) &&
    fallbackHeight > 0
  ) {
    return Math.round(fallbackHeight);
  }
  return undefined;
}

/**
 * Parse Obsidian PDF embed subpath parameters (`#page=3`, `#height=400`,
 * `#page=3&height=400`) from an embed target string.
 */
export function parsePdfEmbedSubpath(
  target: string,
  fallbackHeight?: number,
): PdfEmbedParams {
  const clean = target.split("|")[0] ?? "";
  const hash = clean.indexOf("#");
  const fragment = hash < 0 ? "" : clean.slice(hash + 1).trim();
  const params = new URLSearchParams(fragment);

  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawHeight = Number.parseInt(params.get("height") ?? "", 10);
  const height = resolveHeightParam(rawHeight, fallbackHeight);

  return height === undefined ? { page } : { page, height };
}

/**
 * Build the target href passed to the host `links.open` handler so clicking
 * the PDF embed's Open button opens `lumiere.pdf.viewer` at `#page=N`.
 */
export function formatPdfOpenTarget(target: string, page: number): string {
  const basePath = (target.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return `${basePath}#page=${safePage}`;
}

/** Extract the display filename for the PDF embed toolbar. */
export function pdfFilename(target: string): string {
  const basePath = (target.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
  const rawName = basePath.split("/").at(-1) || basePath;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

let pdfiumPromise: Promise<WrappedPdfiumModule> | undefined;

function resolveWasmUrl(): string {
  if (typeof document !== "undefined") {
    const configured = document.getElementById("app")?.dataset["pdfiumWasm"];
    if (configured) {
      return configured;
    }
  }
  return "/dist/webview/pdfium.wasm";
}

async function loadPdfium(
  wasmBinaryOverride?: ArrayBuffer,
): Promise<WrappedPdfiumModule> {
  if (!pdfiumPromise) {
    pdfiumPromise = (async () => {
      const { init } = await import("@embedpdf/pdfium");
      const wasmBinary =
        wasmBinaryOverride ??
        (await (await fetch(resolveWasmUrl())).arrayBuffer());
      const wasmUrl = resolveWasmUrl();
      const instance = await init({ wasmBinary, locateFile: () => wasmUrl });
      instance.PDFiumExt_Init();
      return instance;
    })().catch((error: unknown) => {
      pdfiumPromise = undefined;
      throw error;
    });
  }
  return pdfiumPromise;
}

function rasterizePageHandle(
  pdfium: WrappedPdfiumModule,
  pageHandle: number,
  targetWidth: number,
): { width: number; height: number; rgba: Uint8ClampedArray } {
  const pageWidth = Math.max(1, pdfium.FPDF_GetPageWidthF(pageHandle));
  const pageHeight = Math.max(1, pdfium.FPDF_GetPageHeightF(pageHandle));
  const scale = Math.max(1, Math.min(2.5, targetWidth / pageWidth));
  const width = Math.max(1, Math.round(pageWidth * scale));
  const height = Math.max(1, Math.round(pageHeight * scale));
  const bitmap = pdfium.FPDFBitmap_Create(width, height, 0);
  if (!bitmap) {
    throw new Error("Could not allocate PDF bitmap");
  }
  try {
    pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
    // FPDF_ANNOT (0x01) | FPDF_REVERSE_BYTE_ORDER (0x10) = 17 (RGBA output)
    pdfium.FPDF_RenderPageBitmap(
      bitmap,
      pageHandle,
      0,
      0,
      width,
      height,
      0,
      17,
    );
    const bufPtr = pdfium.FPDFBitmap_GetBuffer(bitmap);
    const stride = pdfium.FPDFBitmap_GetStride(bitmap);
    const rgba = new Uint8ClampedArray(width * height * 4);
    const heap = (pdfium.pdfium as PdfiumRuntime).HEAPU8;
    const rowBytes = width * 4;
    for (let row = 0; row < height; row += 1) {
      const srcOffset = bufPtr + row * stride;
      rgba.set(heap.subarray(srcOffset, srcOffset + rowBytes), row * rowBytes);
    }
    return { width, height, rgba };
  } finally {
    pdfium.FPDFBitmap_Destroy(bitmap);
  }
}

/**
 * Render a 1-indexed page from a PDF byte buffer into an RGBA pixel buffer
 * using `@embedpdf/pdfium` (PDFium WASM).
 */
export async function renderPdfPageFromBytes(
  bytes: Uint8Array,
  requestedPage: number,
  targetWidth = 760,
  wasmBinaryOverride?: ArrayBuffer,
): Promise<RenderedPdfPage> {
  const pdfium = await loadPdfium(wasmBinaryOverride);
  const wasm = pdfium.pdfium as PdfiumRuntime;
  const ptr = wasm.wasmExports.malloc(bytes.length);
  if (!ptr) {
    throw new Error("Could not allocate WASM memory for PDF");
  }
  wasm.HEAPU8.set(bytes, ptr);
  const doc = pdfium.FPDF_LoadMemDocument(ptr, bytes.length, "");
  if (!doc) {
    wasm.wasmExports.free(ptr);
    throw new Error("Could not load PDF document");
  }
  try {
    const pageCount = pdfium.FPDF_GetPageCount(doc);
    if (pageCount <= 0) {
      throw new Error("PDF document has no pages");
    }
    const page = Math.min(
      Math.max(1, Math.floor(requestedPage || 1)),
      pageCount,
    );
    const pageHandle = pdfium.FPDF_LoadPage(doc, page - 1);
    if (!pageHandle) {
      throw new Error(`Could not load PDF page ${page}`);
    }
    try {
      const raster = rasterizePageHandle(pdfium, pageHandle, targetWidth);
      return { pageCount, page, ...raster };
    } finally {
      pdfium.FPDF_ClosePage(pageHandle);
    }
  } finally {
    pdfium.FPDF_CloseDocument(doc);
    wasm.wasmExports.free(ptr);
  }
}

export interface MountPdfEmbedOptions {
  readonly node: HTMLElement;
  readonly target: string;
  readonly url: string;
  readonly wiki: boolean;
  readonly signal: AbortSignal;
  readonly measure: () => void;
  readonly open: (target: string, wiki: boolean) => void;
}

interface PdfEmbedDom {
  readonly container: HTMLDivElement;
  readonly viewer: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly prevBtn: HTMLButtonElement;
  readonly nextBtn: HTMLButtonElement;
  readonly pageNumbers: HTMLSpanElement;
  readonly openBtn: HTMLButtonElement;
}

function createNavButton(
  className: string,
  text: string,
  ariaLabel: string,
  disabled: boolean,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `pdf-nav-button ${className}`;
  btn.textContent = text;
  btn.setAttribute("aria-label", ariaLabel);
  btn.disabled = disabled;
  return btn;
}

function buildPdfEmbedDom(
  target: string,
  initialPage: number,
  height: number | undefined,
): PdfEmbedDom {
  const container = document.createElement("div");
  container.className = "pdf-embed";
  container.dataset["page"] = String(initialPage);
  if (height !== undefined) {
    container.style.height = `${height}px`;
    container.dataset["pdfHeight"] = String(height);
  }

  const toolbar = document.createElement("div");
  toolbar.className = "pdf-toolbar";
  const left = document.createElement("div");
  left.className = "pdf-toolbar-left";

  const title = document.createElement("span");
  title.className = "pdf-embed-title";
  title.textContent = pdfFilename(target);

  const prevBtn = createNavButton(
    "pdf-prev-page",
    "‹",
    "Previous page",
    initialPage <= 1,
  );
  const pageNumbers = document.createElement("span");
  pageNumbers.className = "pdf-page-numbers";
  pageNumbers.setAttribute("aria-live", "polite");
  pageNumbers.textContent = `Page ${initialPage}`;
  const nextBtn = createNavButton("pdf-next-page", "›", "Next page", true);
  left.append(title, prevBtn, pageNumbers, nextBtn);

  const right = document.createElement("div");
  right.className = "pdf-toolbar-right";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "open-embed pdf-open-button";
  openBtn.textContent = "Open PDF ↗";
  right.append(openBtn);
  toolbar.append(left, right);

  const viewer = document.createElement("div");
  viewer.className = "pdf-viewer-container";
  const pageWrapper = document.createElement("div");
  pageWrapper.className = "pdf-page-wrapper";
  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  pageWrapper.append(canvas);
  viewer.append(pageWrapper);
  container.append(toolbar, viewer);

  return { container, viewer, canvas, prevBtn, nextBtn, pageNumbers, openBtn };
}

function drawRenderedPdfPage(
  dom: PdfEmbedDom,
  rendered: RenderedPdfPage,
  target: string,
): void {
  dom.container.dataset["page"] = String(rendered.page);
  dom.container.dataset["pageCount"] = String(rendered.pageCount);
  dom.canvas.dataset["pageNumber"] = String(rendered.page);
  dom.canvas.width = rendered.width;
  dom.canvas.height = rendered.height;
  const ctx2d = dom.canvas.getContext("2d");
  if (ctx2d) {
    const imageData = new ImageData(
      new Uint8ClampedArray(rendered.rgba),
      rendered.width,
      rendered.height,
    );
    ctx2d.putImageData(imageData, 0, 0);
  }
  dom.pageNumbers.textContent = `Page ${rendered.page} / ${rendered.pageCount}`;
  dom.prevBtn.disabled = rendered.page <= 1;
  dom.nextBtn.disabled = rendered.page >= rendered.pageCount;
  dom.openBtn.setAttribute(
    "aria-label",
    `Open ${formatPdfOpenTarget(target, rendered.page)}`,
  );
}

function bindPdfToolbarEvents(
  dom: PdfEmbedDom,
  options: MountPdfEmbedOptions,
  getState: () => { currentPage: number; totalPages: number },
  paintPage: (page: number) => Promise<void>,
): void {
  const { target, wiki, signal, open } = options;
  dom.openBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      open(formatPdfOpenTarget(target, getState().currentPage), wiki);
    },
    { signal },
  );
  dom.prevBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { currentPage } = getState();
      if (currentPage > 1) {
        void paintPage(currentPage - 1);
      }
    },
    { signal },
  );
  dom.nextBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { currentPage, totalPages } = getState();
      if (currentPage < totalPages) {
        void paintPage(currentPage + 1);
      }
    },
    { signal },
  );
}

/**
 * Mount an Obsidian-compatible inline `.pdf-embed` viewer inside `node`
 * powered by `@embedpdf/pdfium`.
 */
export function mountPdfEmbed(options: MountPdfEmbedOptions): void {
  const { node, target, url, signal, measure } = options;
  const attrHeight = node.dataset["height"]
    ? Number(node.dataset["height"])
    : undefined;
  const parsed = parsePdfEmbedSubpath(target, attrHeight);

  let currentPage = parsed.page;
  let totalPages = Math.max(1, currentPage);
  let pdfBytes: Uint8Array | undefined;
  let renderSeq = 0;

  const dom = buildPdfEmbedDom(target, currentPage, parsed.height);
  dom.openBtn.setAttribute(
    "aria-label",
    `Open ${formatPdfOpenTarget(target, currentPage)}`,
  );
  node.replaceChildren(dom.container);

  const paintPage = async (pageToRender: number): Promise<void> => {
    const seq = ++renderSeq;
    try {
      if (!pdfBytes) {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        pdfBytes = new Uint8Array(await response.arrayBuffer());
      }
      if (signal.aborted || seq !== renderSeq) {
        return;
      }
      const rendered = await renderPdfPageFromBytes(pdfBytes, pageToRender);
      if (signal.aborted || seq !== renderSeq) {
        return;
      }
      currentPage = rendered.page;
      totalPages = rendered.pageCount;
      drawRenderedPdfPage(dom, rendered, target);
      measure();
    } catch (error) {
      if (signal.aborted || seq !== renderSeq) {
        return;
      }
      dom.container.classList.add("pdf-embed-error");
      dom.pageNumbers.textContent = `Page ${currentPage}`;
      dom.viewer.textContent = `Could not render ${pdfFilename(target)}: ${String(error)}`;
      measure();
    }
  };

  bindPdfToolbarEvents(
    dom,
    options,
    () => ({ currentPage, totalPages }),
    paintPage,
  );
  void paintPage(currentPage);
}
