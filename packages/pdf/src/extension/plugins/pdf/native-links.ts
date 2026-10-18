import * as vscode from "vscode";
import type { Digests, RealPaths } from "@workshop/platform";
import { parseLocationFragment } from "../../../shared/pdf-location";
import { registerSourceLinks, type LinkRun } from "./source-links";
import { containedLink } from "./native-link-containment";
import { deliverNativeLocation } from "./native-delivery";
import { VIEW_TYPE, type PdfPanels } from "./panels";
import { OPEN_NATIVE_LINK_COMMAND_ID } from "./registered-commands";

export function registerNativeLinks(
  panels: PdfPanels,
  platform: { digests: Digests; realPaths: RealPaths | undefined },
): vscode.Disposable {
  const cancellations = new WeakMap<LinkRun, () => void>();
  return registerSourceLinks({
    command: OPEN_NATIVE_LINK_COMMAND_ID,
    digests: platform.digests,
    accepts: (file, fragment) =>
      /\.pdf$/i.test(file) && !!parseLocationFragment(fragment),
    authorize: (root, target) =>
      containedLink(root, target, platform.realPaths),
    begin() {
      let cancelled = false;
      const run = {
        current: () => !cancelled,
        cancel: () => {
          if (cancelled) {
            return;
          }
          cancelled = true;
          cancellations.get(run)?.();
        },
      };
      return run;
    },
    async open(target, _root, column, run) {
      const file = target.with({ fragment: "" });
      await vscode.commands.executeCommand("vscode.openWith", file, VIEW_TYPE, {
        viewColumn: column,
      });
      if (!run.current()) {
        return;
      }
      const panel = await panels.waitFor(file, 5000, column, run.current);
      if (!panel || !run.current()) {
        return;
      }
      const location = parseLocationFragment(target.fragment);
      if (location) {
        await deliverNativeLocation(panel, location, run, cancellations);
      }
    },
  });
}
