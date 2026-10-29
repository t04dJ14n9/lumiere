/**
 * How far the window's controls reach over the notes. With Liquid Glass
 * (the iPad: `:root.liquid-glass`, styles.css) the tab bar floats over the
 * tab bodies, which run to the window's top; each note's page is told, so it
 * keeps its first line and its jumps below the glass (host-node's
 * embedding.ts, `inset`). Elsewhere the bodies start below the bar: 0.
 */
import { useEffect, type RefObject } from "react";

/** Room between the glass and what a page shows under it at rest. */
const GAP = 6;

let current = 0;
const listeners = new Set<() => void>();

/** The inset for a bar ending at `barBottom` over bodies starting at `bodiesTop`. */
export function insetFor(barBottom: number, bodiesTop: number): number {
  const overlap = Math.round(barBottom - bodiesTop);
  return overlap > 0 ? overlap + GAP : 0;
}

export function chromeInset(): number {
  return current;
}

export function onChromeInset(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Measure the inset as the bar and the bodies are laid out. The bodies also
 * get it as `--chrome-inset`, for what they show under the glass themselves.
 */
export function useChromeInset(
  bar: RefObject<HTMLElement | null>,
  bodies: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const measure = () => {
      const area = bodies.current;
      const strip = bar.current;
      if (!area || !strip) {
        return;
      }
      const inset = insetFor(
        strip.getBoundingClientRect().bottom,
        area.getBoundingClientRect().top,
      );
      area.style.setProperty("--chrome-inset", `${inset}px`);
      if (inset !== current) {
        current = inset;
        for (const listener of listeners) {
          listener();
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [bar.current, bodies.current]) {
      if (element) {
        observer.observe(element);
      }
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [bar, bodies]);
}
