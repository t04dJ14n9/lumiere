import {
  ScrollStrategy,
  useScrollCapability,
  useScrollPlugin,
  type LayoutChangePayload,
  type PageVisibilityMetrics,
} from "@embedpdf/plugin-scroll/react";
import { useEffect, useMemo, useState } from "react";
import { DOCUMENT_ID } from "./plugins";

type ScrollState = LayoutChangePayload & {
  currentPage: number;
  totalPages: number;
  strategy: ScrollStrategy;
  pageVisibilityMetrics: PageVisibilityMetrics[];
};

/** useScroll exposes page counts only; subscribe to native layout/metrics for view controls. */
export function useScrollState() {
  const { provides } = useScrollCapability();
  const { plugin } = useScrollPlugin();
  const scope = useMemo(
    () => provides?.forDocument(DOCUMENT_ID) ?? null,
    [provides],
  );
  const [state, setState] = useState<ScrollState>({
    currentPage: 1,
    totalPages: 1,
    strategy: ScrollStrategy.Vertical,
    virtualItems: [],
    totalContentSize: { width: 0, height: 0 },
    pageVisibilityMetrics: [],
  });
  useEffect(() => {
    if (!scope || !provides || !plugin) return;
    setState({
      ...scope.getLayout(),
      ...scope.getMetrics(),
      totalPages: scope.getTotalPages(),
      strategy: plugin.getScrollerLayout(DOCUMENT_ID).strategy,
    });
    // This viewer's registry owns exactly one document, DOCUMENT_ID.
    return provides.onStateChange(setState);
  }, [scope, provides, plugin]);
  return { provides: scope, state };
}
