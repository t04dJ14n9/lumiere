import { parseNativeLineFragment } from "../shared/native-links";
import { contributionId } from "../shared/setting-schema";
import type { NavigationIntent } from "../shared/host";
import { contained } from "./navigation";
import type { NativeNavigation } from "./navigation";
import { openNativeLineRange } from "./open-native-line";
import { registerSourceLinks, type LinkRun } from "./source-links";

export function registerNativeLinks(navigation: NativeNavigation) {
  const intents = new WeakMap<LinkRun, NavigationIntent>();
  return registerSourceLinks({
    command: contributionId("openNativeLink"),
    accepts: (path) => /\.(md|markdown)$/i.test(path),
    authorize: contained,
    begin() {
      const intent = navigation.begin!();
      const run = {
        current: () => !intent.token.cancelled,
        cancel: () => intent.token.cancel(),
      };
      intents.set(run, intent);
      return run;
    },
    async open(target, root, column, run) {
      const intent = intents.get(run)!;
      const lines = parseNativeLineFragment(target.fragment);
      if (lines) {
        await openNativeLineRange(navigation, {
          target: target.with({ fragment: "" }),
          lines,
          column,
          intent: { ...intent, column },
        });
        return;
      }
      await navigation.open(
        root.toString(),
        target.with({ fragment: "" }).toString(),
        target.fragment,
        "here",
        undefined,
        { ...intent, column },
      );
    },
  });
}
