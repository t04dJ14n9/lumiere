import { useEffect, useRef, useState } from "react";
import { ZenWatch } from "../shared/zen";
import { postToHost } from "./host";

/**
 * Whether zen mode is on (the host says so), and a way to set it. When the
 * window was full screen for zen and is no longer, zen ended some other way
 * (Ctrl+K Z, the Command Palette): the viewer clears its own state and tells
 * the host, which tells the other viewers.
 */
export function useZen(): [boolean, (on: boolean) => void] {
  const [zen, setZen] = useState(false);
  const watch = useRef(new ZenWatch());
  const current = useRef(zen);
  current.current = zen;
  useEffect(() => {
    const onResize = (): void => {
      const sizes = [
        { width: window.outerWidth, height: window.outerHeight },
        { width: screen.width, height: screen.height },
      ] as const;
      if (watch.current.left(current.current, ...sizes)) {
        setZen(false);
        postToHost({ type: "zen", exit: false });
      }
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    // A viewer opened while zen is on may be sized after the zen flag arrives.
    window.dispatchEvent(new Event("resize"));
  }, [zen]);
  return [zen, setZen];
}
