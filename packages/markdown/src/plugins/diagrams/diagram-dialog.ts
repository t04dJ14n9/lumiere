import { cloneDiagramSvg } from "./clone-svg";

interface Point {
  x: number;
  y: number;
}

export function svgDimensions(svg: Element): { width: number; height: number } {
  const viewBox = svg
    .getAttribute?.("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox &&
    viewBox.length === 4 &&
    Number.isFinite(viewBox[2]) &&
    viewBox[2]! > 0 &&
    Number.isFinite(viewBox[3]) &&
    viewBox[3]! > 0
  ) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }
  const rect = svg.getBoundingClientRect?.();
  if (rect && rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return { width: 800, height: 600 };
}

export function bindDiagramInspector(
  host: HTMLElement,
  signal: AbortSignal,
): HTMLButtonElement | undefined {
  const svg = host.querySelector?.("svg");
  const doc =
    host.ownerDocument ??
    (typeof document !== "undefined" ? document : undefined);
  if (!svg || !doc?.createElement) {
    return undefined;
  }
  const inspect = doc.createElement("button");
  inspect.type = "button";
  inspect.className = "inspect-diagram";
  inspect.textContent = "⤢";
  inspect.setAttribute("aria-label", "Inspect diagram");
  inspect.setAttribute("title", "View in larger window");
  host.append(inspect);
  const inspector = new DiagramInspector(inspect, svg);
  inspect.addEventListener("click", (event) => inspector.show(event), {
    signal,
  });
  host.addEventListener(
    "dblclick",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest?.("a, button, .internal-link, [role=\x27link\x27]")
      ) {
        return;
      }
      inspector.show(event);
    },
    { signal },
  );
  signal.addEventListener(
    "abort",
    () => {
      inspect.remove?.();
      inspector.close(false);
    },
    { once: true },
  );
  return inspect;
}

class DiagramInspector {
  private dialog?: HTMLDialogElement;
  private abort?: AbortController;
  private scale: number | null = null;
  private size = { width: 800, height: 600 };
  private controls?: ReturnType<typeof createDiagramToolbar>;
  private clone?: SVGSVGElement;
  private area?: HTMLElement;

  constructor(
    private readonly trigger: HTMLButtonElement,
    private readonly svg: Element,
  ) {}

  close(restoreFocus = true): void {
    if (!this.dialog) {
      return;
    }
    this.abort?.abort();
    this.dialog.close?.();
    this.dialog.remove?.();
    delete this.dialog;
    delete this.clone;
    delete this.area;
    delete this.controls;
    if (
      restoreFocus &&
      this.trigger.isConnected &&
      (typeof getComputedStyle === "undefined" ||
        Number(getComputedStyle(this.trigger).opacity) > 0)
    ) {
      this.trigger.focus?.();
    }
  }

  show(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.dialog) {
      return;
    }
    this.size = svgDimensions(this.svg);
    this.abort = new AbortController();
    const parts = createDialogParts(this.svg, this.size);
    this.dialog = parts.dialog;
    this.clone = parts.clone;
    this.area = parts.area;
    this.controls = createDiagramToolbar({
      toolbar: parts.toolbar,
      signal: this.abort.signal,
      toggle: () => this.setScale(this.scale === null ? 1 : null),
      zoom: (factor) => this.zoom(factor),
      close: () => this.close(),
    });
    document.body.append(parts.dialog);
    this.bindEvents(parts.dialog, parts.area, this.abort.signal);
    parts.dialog.showModal?.();
    this.update();
    parts.area.focus?.();
  }

  private fitScale(): number {
    const area = this.area;
    const width = Math.max(1, (area?.clientWidth || 800) - 48);
    const height = Math.max(1, (area?.clientHeight || 600) - 24);
    return Math.min(4, width / this.size.width, height / this.size.height);
  }

  private minimum(): number {
    return Math.min(0.1, this.fitScale());
  }

  private update(): void {
    if (!this.clone || !this.area || !this.controls) {
      return;
    }
    const active = this.scale ?? this.fitScale();
    this.area.classList.toggle("actual-size", this.scale !== null);
    this.clone.style.width = `${Math.round(this.size.width * active)}px`;
    this.clone.style.height = `${Math.round(this.size.height * active)}px`;
    this.controls.toggle.textContent =
      this.scale === null ? "Actual size" : "Fit diagram";
    this.controls.toggle.setAttribute(
      "aria-pressed",
      String(this.scale !== null),
    );
    this.controls.percent.textContent = `${Math.round(100 * active)}%`;
    this.controls.minus.disabled = active <= this.minimum();
    this.controls.plus.disabled = this.scale !== null && this.scale >= 8;
  }

  private setScale(value: number | null, point?: Point): void {
    if (!this.clone || !this.area) {
      return;
    }
    const bounds = this.clone.getBoundingClientRect();
    const viewport = this.area.getBoundingClientRect();
    const anchor = point ?? {
      x: viewport.left + viewport.width / 2,
      y: viewport.top + viewport.height / 2,
    };
    const ratioX = bounds.width ? (anchor.x - bounds.left) / bounds.width : 0.5;
    const ratioY = bounds.height
      ? (anchor.y - bounds.top) / bounds.height
      : 0.5;
    this.scale =
      value === null ? null : Math.min(8, Math.max(this.minimum(), value));
    this.update();
    if (this.scale === null) {
      this.area.scrollLeft = 0;
      this.area.scrollTop = 0;
      return;
    }
    const next = this.clone.getBoundingClientRect();
    this.area.scrollLeft += next.left + ratioX * next.width - anchor.x;
    this.area.scrollTop += next.top + ratioY * next.height - anchor.y;
  }

  private zoom(factor: number, point?: Point): void {
    this.setScale((this.scale ?? this.fitScale()) * factor, point);
  }

  private bindEvents(
    dialog: HTMLDialogElement,
    area: HTMLElement,
    signal: AbortSignal,
  ): void {
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal },
    );
    dialog.addEventListener(
      "click",
      (event) => {
        if (event.target === dialog) {
          this.close();
        }
      },
      { signal },
    );
    dialog.addEventListener(
      "keydown",
      (event) => {
        event.stopPropagation();
        this.keyDown(event);
      },
      { signal },
    );
    this.bindWheelAndResize(area, signal);
    this.bindPan(area, signal);
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === "+" || event.key === "=") {
      this.zoom(1.25);
    } else if (event.key === "-") {
      this.zoom(1 / 1.25);
    } else if (event.key === "0") {
      this.setScale(null);
    } else if (event.key === "1") {
      this.setScale(1);
    } else {
      return;
    }
    event.preventDefault();
  }

  private bindWheelAndResize(area: HTMLElement, signal: AbortSignal): void {
    area.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        this.zoom(Math.exp(-Math.sign(event.deltaY) * 0.15), {
          x: event.clientX,
          y: event.clientY,
        });
      },
      { signal, passive: false },
    );
    if (typeof ResizeObserver !== "undefined") {
      const resize = new ResizeObserver(() => this.update());
      resize.observe(area);
      signal.addEventListener("abort", () => resize.disconnect(), {
        once: true,
      });
    }
  }

  private bindPan(area: HTMLElement, signal: AbortSignal): void {
    let drag:
      | { x: number; y: number; left: number; top: number; id: number }
      | undefined;
    area.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.button !== 0 ||
          this.scale === null ||
          (area.scrollWidth <= area.clientWidth &&
            area.scrollHeight <= area.clientHeight)
        ) {
          return;
        }
        event.preventDefault();
        area.focus();
        area.setPointerCapture?.(event.pointerId);
        area.classList.add("panning");
        drag = {
          x: event.clientX,
          y: event.clientY,
          left: area.scrollLeft,
          top: area.scrollTop,
          id: event.pointerId,
        };
      },
      { signal },
    );
    area.addEventListener(
      "pointermove",
      (event) => {
        if (drag?.id === event.pointerId) {
          area.scrollLeft = drag.left + drag.x - event.clientX;
          area.scrollTop = drag.top + drag.y - event.clientY;
        }
      },
      { signal },
    );
    const stop = () => {
      drag = undefined;
      area.classList.remove("panning");
    };
    area.addEventListener("pointerup", stop, { signal });
    area.addEventListener("lostpointercapture", stop, { signal });
  }
}

function createDialogParts(
  svg: Element,
  size: { width: number; height: number },
) {
  const dialog = document.createElement("dialog");
  dialog.className = "image-inspector diagram-inspector";
  dialog.setAttribute("aria-label", "Mermaid diagram");
  const toolbar = document.createElement("nav");
  toolbar.setAttribute("aria-label", "Diagram controls");
  const area = document.createElement("section");
  area.className = "media-area";
  area.setAttribute("aria-label", "Mermaid diagram");
  area.tabIndex = 0;
  // Mermaid theme CSS is scoped to `#svgId …`; stripping the id makes fills
  // compute to black in the lightbox. Assign a unique id and rewrite styles.
  const clone = cloneDiagramSvg(svg);
  clone.style.maxWidth = "none";
  area.append(clone);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Diagram status");
  status.textContent = `${Math.round(size.width)} × ${Math.round(size.height)}`;
  dialog.append(toolbar, area, status);
  return { dialog, toolbar, area, clone, status };
}

function createDiagramToolbar(options: {
  toolbar: HTMLElement;
  signal: AbortSignal;
  toggle(): void;
  zoom(factor: number): void;
  close(): void;
}) {
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", action, { signal: options.signal });
    options.toolbar.append(node);
    return node;
  };
  const toggle = button("Actual size", options.toggle);
  const minus = button("−", () => options.zoom(1 / 1.25));
  minus.setAttribute("aria-label", "Zoom out");
  const percent = document.createElement("output");
  percent.setAttribute("aria-label", "Diagram zoom");
  options.toolbar.append(percent);
  const plus = button("+", () => options.zoom(1.25));
  plus.setAttribute("aria-label", "Zoom in");
  const dismiss = button("Close", options.close);
  dismiss.setAttribute("aria-label", "Close diagram");
  return { toggle, minus, percent, plus, dismiss };
}
