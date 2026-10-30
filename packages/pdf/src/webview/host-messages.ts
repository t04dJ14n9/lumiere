import { useEffect, useRef } from "react";
import type { HostMessage } from "../shared/messages";
import type { ToolbarSettings } from "../shared/toolbar-settings";
import type { ViewChoices, ViewSettings } from "../shared/view-settings";
import { parseViewerAction } from "../shared/view-state";
import { currentHostGeneration, listenToHost } from "./host";
import type { useJumpHistory } from "./jump-history";
import type { Navigation } from "./navigation";
import { currentViewSettings, rememberViewSettings } from "./reading-position";
import { rememberPageColors } from "./page-colors";
import { rememberToolbarSettings } from "./toolbar-settings";
import type { useViewActions } from "./view-sync";

export interface HostMessageHandlers {
  show: Navigation["show"];
  history: ReturnType<typeof useJumpHistory>;
  runAction: ReturnType<typeof useViewActions>;
  requestLookUp: () => void;
  reportSelection: () => void;
  setLookUp: (enabled: boolean) => void;
  setZen: (on: boolean) => void;
  setToolbar: (toolbar: ToolbarSettings) => void;
  setMotionSetting: (setting: ViewSettings["smoothScrolling"]) => void;
  setChoices: React.Dispatch<React.SetStateAction<ViewChoices>>;
  setPageColors: (effective: "normal" | "dark") => void;
}

/** What the extension asks of this viewer: history, actions and settings. */
export function useHostMessages(handlers: HostMessageHandlers): void {
  const hostGeneration = useRef(currentHostGeneration()).current;
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(
    () =>
      listenToHost(
        (message) => handleHostMessage(message, latest.current),
        hostGeneration,
      ),
    [hostGeneration],
  );
}

function handleHostMessage(
  message: Exclude<HostMessage, { type: "load" }>,
  handlers: HostMessageHandlers,
): void {
  const { history, show } = handlers;
  if (history.handle(message)) {
    return;
  }
  switch (message.type) {
    case "goTo":
      history.jump(
        () => show(message.location, message.top),
        message.requestId,
        false,
        message.expectedIntent,
      );
      return;
    case "action": {
      const action = parseViewerAction(message.action);
      if (action) {
        handlers.runAction(action);
      }
      return;
    }
    case "viewSettings":
      applyViewSettings(message.settings, handlers);
      return;
    case "lookUpRequest":
      handlers.requestLookUp();
      return;
    case "reportSelection":
      handlers.reportSelection();
      return;
    case "lookUp":
      handlers.setLookUp(message.enabled);
      return;
    case "zen":
      handlers.setZen(message.on);
      return;
    case "toolbar":
      handlers.setToolbar(rememberToolbarSettings(message.toolbar));
      return;
    case "pageColors":
      handlers.setPageColors(rememberPageColors(message.effective));
      return;
  }
}

/** New view settings: smooth scrolling now, a new page layout for this PDF. */
function applyViewSettings(
  next: ViewSettings,
  handlers: Pick<HostMessageHandlers, "setMotionSetting" | "setChoices">,
): void {
  const previous = currentViewSettings();
  const settings = rememberViewSettings(next);
  handlers.setMotionSetting(settings.smoothScrolling);
  if (settings.pageLayout !== previous.pageLayout) {
    handlers.setChoices((current) => ({
      ...current,
      pageLayout: settings.pageLayout,
    }));
  }
}
