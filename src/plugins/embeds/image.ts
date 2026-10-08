import { record } from "../../shared/guards";

export function imageControls(
  image: HTMLImageElement,
  area: HTMLElement,
  toolbar: HTMLElement,
  status: HTMLElement,
  saved: unknown,
  persist: (value: unknown) => void,
  signal: AbortSignal,
): void {
  const options = { signal };
  let scale: number | null =
    record(saved) &&
    typeof saved.scale === "number" &&
    Number.isFinite(saved.scale) &&
    saved.scale > 0
      ? Math.min(8, saved.scale)
      : record(saved) && saved.actual === true
        ? 1
        : null;
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", action, options);
    toolbar.append(node);
    return node;
  };
  const fitScale = (): number =>
    Math.min(
      1,
      Math.max(1, area.clientWidth - 48) / (image.naturalWidth || 1),
      Math.max(1, area.clientHeight - 24) / (image.naturalHeight || 1),
    );
  const minimum = (): number => Math.min(0.1, fitScale());
  const toggle = button("Actual size", () => set(scale === null ? 1 : null));
  const minus = button("−", () => zoom(1 / 1.25));
  minus.setAttribute("aria-label", "Zoom out");
  const percent = document.createElement("output");
  percent.setAttribute("aria-label", "Image zoom");
  toolbar.append(percent);
  const plus = button("+", () => zoom(1.25));
  plus.setAttribute("aria-label", "Zoom in");
  const update = (): void => {
    area.classList.toggle("actual-size", scale !== null);
    image.style.width = scale === null ? "" : `${image.naturalWidth * scale}px`;
    image.style.height =
      scale === null ? "" : `${image.naturalHeight * scale}px`;
    toggle.textContent = scale === null ? "Actual size" : "Fit image";
    toggle.setAttribute("aria-pressed", String(scale !== null));
    percent.textContent = `${Math.round(100 * (scale ?? fitScale()))}%`;
    minus.disabled = (scale ?? fitScale()) <= minimum();
    plus.disabled = scale !== null && scale >= 8;
  };
  const set = (
    value: number | null,
    point?: { x: number; y: number },
  ): void => {
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
    scale = value === null ? null : Math.min(8, Math.max(minimum(), value));
    update();
    const next = image.getBoundingClientRect();
    if (scale === null) {
      area.scrollLeft = 0;
      area.scrollTop = 0;
    } else {
      area.scrollLeft += next.left + x * next.width - point.x;
      area.scrollTop += next.top + y * next.height - point.y;
    }
    persist({ actual: scale !== null, scale });
  };
  const zoom = (factor: number, point?: { x: number; y: number }): void =>
    set((scale ?? fitScale()) * factor, point);
  area.tabIndex = 0;
  area.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        zoom(1.25);
      } else if (event.key === "-") {
        zoom(1 / 1.25);
      } else if (event.key === "0") {
        set(null);
      } else if (event.key === "1") {
        set(1);
      } else {
        return;
      }
      event.preventDefault();
    },
    options,
  );
  area.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      zoom(Math.exp(-Math.sign(event.deltaY) * 0.15), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { signal, passive: false },
  );
  let drag:
    | { x: number; y: number; left: number; top: number; id: number }
    | undefined;
  area.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.button !== 0 ||
        scale === null ||
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
    options,
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
    options,
  );
  const stop = (): void => {
    drag = undefined;
    area.classList.remove("panning");
  };
  area.addEventListener("pointerup", stop, options);
  area.addEventListener("lostpointercapture", stop, options);
  image.addEventListener(
    "load",
    () => {
      status.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
      update();
    },
    options,
  );
  const resize = new ResizeObserver(update);
  resize.observe(area);
  signal.addEventListener(
    "abort",
    () => {
      resize.disconnect();
      stop();
    },
    { once: true },
  );
  update();
}
