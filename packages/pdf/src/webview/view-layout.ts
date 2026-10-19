import { useScrollState } from "./scroll-state";
import { ScrollStrategy } from "@embedpdf/plugin-scroll/react";
import { useSpreadCapability } from "@embedpdf/plugin-spread/react";
import { useEffect, useMemo } from "react";
import type { ViewChoices } from "../shared/view-settings";
import type { Navigation } from "./navigation";
import { DOCUMENT_ID } from "./plugins";
import { nativeSpread } from "./spread-mode";

/** Apply native pairing and direction, then keep the selected page in view. */
export function useViewLayout(
  choices: ViewChoices,
  navigation: Navigation,
): void {
  const { provides: scroll, state } = useScrollState();
  const { provides } = useSpreadCapability();
  const spread = useMemo(
    () => provides?.forDocument(DOCUMENT_ID) ?? null,
    [provides],
  );
  const spreadMode = nativeSpread(choices.pageLayout);
  const strategy =
    choices.scrollDirection === "horizontal"
      ? ScrollStrategy.Horizontal
      : ScrollStrategy.Vertical;
  const { currentPage, show } = navigation;
  useEffect(() => {
    if (!scroll || !spread) {
      return;
    }
    const pairingChanged = spread.getSpreadMode() !== spreadMode;
    const directionChanged = state.strategy !== strategy;
    if (!pairingChanged && !directionChanged) {
      return;
    }
    if (pairingChanged) {
      spread.setSpreadMode(spreadMode);
    }
    if (directionChanged) {
      scroll.setScrollStrategy(strategy);
    }
    show({ page: currentPage }, undefined, 0, true);
  }, [scroll, spread, spreadMode, state.strategy, strategy, currentPage, show]);
}
