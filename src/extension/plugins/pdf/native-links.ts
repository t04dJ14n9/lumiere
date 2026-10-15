import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { parseLocationFragment } from "../../../shared/pdf-location";
import { registerSourceLinks, type LinkRun } from "./source-links";
import { deliverNativeLocation } from "./native-delivery";
import { VIEW_TYPE, type PdfPanels } from "./panels";
import { OPEN_NATIVE_LINK_COMMAND_ID } from "./registered-commands";

export function registerNativeLinks(panels: PdfPanels): vscode.Disposable {
  const cancellations = new WeakMap<LinkRun, () => void>();
  return registerSourceLinks({
    command: OPEN_NATIVE_LINK_COMMAND_ID,
    accepts: (file, fragment) =>
      /\.pdf$/i.test(file) && !!parseLocationFragment(fragment),
    authorize: contained,
    begin() {
      let cancelled = false;
      const run = {
        current: () => !cancelled,
        cancel: () => {
          if (cancelled) return;
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
      if (!run.current()) return;
      const panel = await panels.waitFor(file, 5000, column, run.current);
      if (!panel || !run.current()) return;
      const location = parseLocationFragment(target.fragment);
      if (location) await deliverNativeLocation(panel, location, run, cancellations);
    },
  });
}

async function contained(root: vscode.Uri, target: vscode.Uri): Promise<void> {
  if (
    root.scheme !== "file" ||
    target.scheme !== "file" ||
    root.authority !== target.authority
  )
    throw new Error("Local workspace links only");
  const relative = path.relative(
    await realpath(root.fsPath),
    await realpath(target.fsPath),
  );
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw new Error("Link escapes workspace folder");
}

