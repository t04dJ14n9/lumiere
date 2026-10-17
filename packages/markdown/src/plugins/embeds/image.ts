import { record } from "../../shared/guards";

interface ImageOptions {
  image: HTMLImageElement;
  area: HTMLElement;
  toolbar: HTMLElement;
  status: HTMLElement;
  saved: unknown;
  persist(value: unknown): void;
  signal: AbortSignal;
}
type Point = { x: number; y: number };

export function imageControls(options: ImageOptions): void {
  new ImageControls(options).bind();
}

export function savedImageScale(saved: unknown): number | null {
  if (!record(saved)) {
    return null;
  }
  if (
    typeof saved.scale === "number" &&
    Number.isFinite(saved.scale) &&
    saved.scale > 0
  ) {
    return Math.min(8, saved.scale);
  }
  return saved.actual === true ? 1 : null;
}

class ImageControls {
  private scale: number | null;
  private readonly controls: ReturnType<typeof zoomToolbar>;
  constructor(private readonly options: ImageOptions) {
    this.scale = savedImageScale(options.saved);
    this.controls = zoomToolbar({
      toolbar: options.toolbar,
      signal: options.signal,
      toggle: () => this.setScale(this.scale === null ? 1 : null),
      zoom: (factor) => this.zoom(factor),
    });
  }

  bind(): void {
    this.bindZoom();
    this.bindPan();
    this.bindMeasurement();
    this.update();
  }

  private fitScale(): number {
    const { area, image } = this.options;
    return Math.min(
      1,
      Math.max(1, area.clientWidth - 48) / (image.naturalWidth || 1),
      Math.max(1, area.clientHeight - 24) / (image.naturalHeight || 1),
    );
  }
  private minimum(): number {
    return Math.min(0.1, this.fitScale());
  }

  private update(): void {
    const { image, area } = this.options;
    const { toggle, minus, percent, plus } = this.controls;
    area.classList.toggle("actual-size", this.scale !== null);
    image.style.width =
      this.scale === null ? "" : `${image.naturalWidth * this.scale}px`;
    image.style.height =
      this.scale === null ? "" : `${image.naturalHeight * this.scale}px`;
    toggle.textContent = this.scale === null ? "Actual size" : "Fit image";
    toggle.setAttribute("aria-pressed", String(this.scale !== null));
    percent.textContent = `${Math.round(100 * (this.scale ?? this.fitScale()))}%`;
    minus.disabled = (this.scale ?? this.fitScale()) <= this.minimum();
    plus.disabled = this.scale !== null && this.scale >= 8;
  }

  private setScale(value: number | null, point?: Point): void {
    const { image, area, persist } = this.options;
    if (!image.naturalWidth) {
      return;
    }
    const bounds = image.getBoundingClientRect();
    const viewport = area.getBoundingClientRect();
    point ??= {
      x: viewport.left + viewport.width / 2,
      y: viewport.top + viewport.height / 2,
    };
    const x = (point.x - bounds.left) / bounds.width;
    const y = (point.y - bounds.top) / bounds.height;
    this.scale =
      value === null ? null : Math.min(8, Math.max(this.minimum(), value));
    this.update();
    const next = image.getBoundingClientRect();
    if (this.scale === null) {
      area.scrollLeft = 0;
      area.scrollTop = 0;
    } else {
      area.scrollLeft += next.left + x * next.width - point.x;
      area.scrollTop += next.top + y * next.height - point.y;
    }
    persist({ actual: this.scale !== null, scale: this.scale });
  }

  private zoom(factor: number, point?: Point): void {
    this.setScale((this.scale ?? this.fitScale()) * factor, point);
  }

  private bindZoom(): void {
    const { area, signal } = this.options;
    area.tabIndex = 0;
    area.addEventListener("keydown", (event) => this.zoomKey(event), {
      signal,
    });
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
  }

  private zoomKey(event: KeyboardEvent): void {
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

  private bindPan(): void {
    const { area, signal } = this.options;
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
        area.setPointerCapture(event.pointerId);
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
        if (drag?.id !== event.pointerId) {
          return;
        }
        area.scrollLeft = drag.left + drag.x - event.clientX;
        area.scrollTop = drag.top + drag.y - event.clientY;
      },
      { signal },
    );
    const stop = () => {
      drag = undefined;
      area.classList.remove("panning");
    };
    area.addEventListener("pointerup", stop, { signal });
    area.addEventListener("lostpointercapture", stop, { signal });
    this.stopPan = stop;
  }

  private stopPan = () => {};

  private bindMeasurement(): void {
    const { image, area, status, signal } = this.options;
    image.addEventListener(
      "load",
      () => {
        status.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
        this.update();
      },
      { signal },
    );
    const resize = new ResizeObserver(() => this.update());
    resize.observe(area);
    signal.addEventListener(
      "abort",
      () => {
        resize.disconnect();
        this.stopPan();
      },
      { once: true },
    );
  }
}

function zoomToolbar({
  toolbar,
  signal,
  toggle: toggleScale,
  zoom,
}: {
  toolbar: HTMLElement;
  signal: AbortSignal;
  toggle(): void;
  zoom(factor: number): void;
}) {
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", action, { signal });
    toolbar.append(node);
    return node;
  };
  const toggle = button("Actual size", toggleScale);
  const minus = button("−", () => zoom(1 / 1.25));
  minus.setAttribute("aria-label", "Zoom out");
  const percent = document.createElement("output");
  percent.setAttribute("aria-label", "Image zoom");
  toolbar.append(percent);
  const plus = button("+", () => zoom(1.25));
  plus.setAttribute("aria-label", "Zoom in");
  return { toggle, minus, percent, plus };
}
