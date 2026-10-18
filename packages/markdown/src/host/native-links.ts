import { nativeLineFragment } from "../shared/native-links";
import { contributionId } from "../shared/setting-schema";
import type { Navigation, NavigationIntent } from "../shared/host";
import { contained, type NavigationPlatform } from "./navigation";
import { registerSourceLinks, type LinkRun } from "./source-links";

export function registerNativeLinks(
  navigation: Navigation,
  platform: NavigationPlatform,
) {
  const intents = new WeakMap<LinkRun, NavigationIntent>();
  return registerSourceLinks({
    command: contributionId("openNativeLink"),
    digests: platform.digests,
    accepts: (path, fragment) =>
      /\.(md|markdown)$/i.test(path) && !nativeLineFragment(fragment),
    authorize: (root, target) => contained(root, target, platform.realPaths),
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
