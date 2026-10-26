/**
 * What the page records while a scroll scenario runs. `installRecorder` runs
 * inside the page (Playwright serialises it), so it uses nothing from its
 * module scope. It reads no layout itself: frames come from
 * requestAnimationFrame, on-screen diagrams from an IntersectionObserver, and
 * heights from CodeMirror's height map.
 */

export interface FrameRecord {
  /** requestAnimationFrame timestamps. */
  frames: number[];
  /** Mermaid fences on screen without their SVG, per frame. */
  blank: number[];
  /** Long animation frames: duration, blocking time, and the top scripts. */
  loafs: {
    start: number;
    duration: number;
    blocking: number;
    layout: number;
    scripts: { name: string; duration: number; forcedLayout: number }[];
  }[];
  /** Layout shift scores (content moved while not scrolled). */
  shifts: number[];
  /** Layout shift score by the moved element's class. */
  shiftSources: Record<string, number>;
  /** Programmatic scrollTop writes (CodeMirror's anchor corrections) and their size. */
  corrections: number[];
  /** Height map total at each frame. */
  heights: number[];
  /** From a diagram entering the screen to its SVG, per diagram. */
  diagramLatency: number[];
  /** Diagrams still blank on screen when the scenario stopped. */
  pendingAtStop: number;
}

declare global {
  interface Window {
    scrollRecorder: {
      start(): void;
      stop(): FrameRecord;
      /** Resolves when no on-screen diagram is blank, with the wait in ms. */
      settled(timeoutMs: number): Promise<number>;
      ownWrite(run: () => void): void;
    };
  }
}

export function installRecorder(): void {
  const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
  const fiber = [...window.harness.views[0]!.plugins].find(
    (plugin) => plugin.definition.name === "livePreview",
  );
  const view = fiber!.context!.editor.view;
  let running = false;
  let ownWrite = false;
  let record: FrameRecord;
  const reset = (): FrameRecord => ({
    frames: [],
    blank: [],
    loafs: [],
    shifts: [],
    shiftSources: {},
    corrections: [],
    heights: [],
    diagramLatency: [],
    pendingAtStop: 0,
  });
  record = reset();

  const onScreen = new Set<Element>();
  const enteredAt = new Map<Element, number>();
  const hasSvg = (fence: Element) => Boolean(fence.querySelector("svg"));
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onScreen.add(entry.target);
          if (running && !hasSvg(entry.target)) {
            enteredAt.set(entry.target, performance.now());
          }
        } else {
          onScreen.delete(entry.target);
          enteredAt.delete(entry.target);
        }
      }
    },
    { root: scroller, threshold: 0 },
  );
  const watchFences = (root: ParentNode) => {
    for (const fence of root.querySelectorAll('[data-fence="mermaid"]')) {
      intersection.observe(fence);
    }
  };
  watchFences(view.contentDOM);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          if (node.matches('[data-fence="mermaid"]')) {
            intersection.observe(node);
          }
          watchFences(node);
        }
      }
    }
  }).observe(view.contentDOM, { childList: true, subtree: true });

  const tick = (time: number) => {
    if (running) {
      record.frames.push(time);
      record.heights.push(view.contentHeight);
      let blank = 0;
      for (const fence of onScreen) {
        if (!hasSvg(fence)) {
          blank++;
        } else if (enteredAt.has(fence)) {
          record.diagramLatency.push(time - enteredAt.get(fence)!);
          enteredAt.delete(fence);
        }
      }
      record.blank.push(blank);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  new PerformanceObserver((list) => {
    if (!running) {
      return;
    }
    for (const entry of list.getEntries() as unknown as {
      startTime: number;
      duration: number;
      blockingDuration: number;
      styleAndLayoutStart: number;
      scripts: {
        duration: number;
        forcedStyleAndLayoutDuration: number;
        invoker: string;
        sourceFunctionName: string;
        sourceCharPosition: number;
      }[];
    }[]) {
      record.loafs.push({
        start: entry.startTime,
        duration: entry.duration,
        blocking: entry.blockingDuration,
        layout: entry.startTime + entry.duration - entry.styleAndLayoutStart,
        scripts: [...entry.scripts]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 3)
          .map((script) => ({
            name: `${script.invoker} ${script.sourceFunctionName}@${script.sourceCharPosition}`,
            duration: Math.round(script.duration),
            forcedLayout: Math.round(script.forcedStyleAndLayoutDuration),
          })),
      });
    }
  }).observe({ type: "long-animation-frame", buffered: false });

  new PerformanceObserver((list) => {
    if (running) {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        sources: { node?: Node | null }[];
      }[]) {
        record.shifts.push(entry.value);
        for (const source of entry.sources) {
          const node = source.node;
          const name =
            node instanceof Element
              ? `${node.tagName.toLowerCase()}.${[...node.classList].slice(0, 2).join(".")}`
              : String(node?.nodeName);
          record.shiftSources[name] =
            (record.shiftSources[name] ?? 0) +
            entry.value / entry.sources.length;
        }
      }
    }
  }).observe({ type: "layout-shift", buffered: false });

  const descriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollTop",
  )!;
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get() {
      return descriptor.get!.call(this);
    },
    set(value: number) {
      if (running && !ownWrite) {
        record.corrections.push(value - descriptor.get!.call(this));
      }
      descriptor.set!.call(this, value);
    },
  });

  window.scrollRecorder = {
    start() {
      record = reset();
      enteredAt.clear();
      const now = performance.now();
      for (const fence of onScreen) {
        if (!hasSvg(fence)) {
          enteredAt.set(fence, now);
        }
      }
      running = true;
    },
    stop() {
      running = false;
      record.pendingAtStop = [...onScreen].filter((f) => !hasSvg(f)).length;
      return record;
    },
    async settled(timeoutMs) {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        if ([...onScreen].every(hasSvg)) {
          return performance.now() - start;
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      return Infinity;
    },
    ownWrite(run) {
      ownWrite = true;
      try {
        run();
      } finally {
        ownWrite = false;
      }
    },
  };
}
