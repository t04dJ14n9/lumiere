import type { Cancellation } from "../../shared/rpc/endpoint";
import type { Workbench } from "../../shared/runtime";
import type { EditorPanel, Editors } from "../editor/api";
import { renameTarget } from "./title";
import { TitleTransfers } from "./transfers";
import type { TitleFocus } from "./protocol";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";

interface RenameOptions {
  panel: EditorPanel;
  title: string;
  focus?: TitleFocus;
  token: Cancellation;
}
export class TitleRenames {
  readonly transfers = new TitleTransfers();
  constructor(
    private readonly editors: Editors,
    private readonly workbench: Workbench,
    private readonly restoreReady: () => Promise<void>,
  ) {}

  rename(options: RenameOptions): Promise<string> {
    return options.panel.session.withAction(() => this.perform(options));
  }

  private async perform({
    panel,
    title,
    focus,
    token,
  }: RenameOptions): Promise<string> {
    if (panel.document.isUntitled || !this.workbench.renameFile) {
      throw new Error("Save the note before renaming it.");
    }
    const target = renameTarget(panel.document.uri, title);
    if (target === panel.document.uri) {
      return target;
    }
    await panel.session.flush();
    const views = await this.captureViews(panel, focus);
    if (token.cancelled) {
      throw new Error("Rename cancelled.");
    }
    for (const view of views) {
      const { column } = view.panel;
      this.transfers.set(view.panel.id, {
        target,
        ...(column === undefined ? {} : { column }),
        snapshot: view.snapshot,
        ...(view.active && { focus: focus ?? "body" }),
      });
    }
    try {
      await this.workbench.renameFile(panel.document, target);
      // Optional custom editors may reopen as text after rename; reopen each group,
      // active last, then restore only panels whose webviews have initialized.
      for (const view of views.sort(
        (a, b) => Number(a.active) - Number(b.active),
      )) {
        await this.workbench.execute(
          "vscode.openWith",
          target,
          MARKDOWN_EDITOR.viewType,
          { viewColumn: view.panel.column, preserveFocus: !view.active },
        );
        await this.restoreReady();
      }
      return target;
    } catch (error) {
      this.transfers.remove(views.map((view) => view.panel.id));
      throw error;
    }
  }
  private async captureViews(panel: EditorPanel, focus?: TitleFocus) {
    const version = panel.document.version;
    const siblings = this.editors
      .all()
      .filter((candidate) => candidate.session === panel.session);
    const views = await Promise.all(
      siblings.map(async (current) => ({
        panel: current,
        snapshot: await this.editors.capture(current.id),
        active: focus ? current.id === panel.id : current.active(),
      })),
    );
    if (
      panel.document.version !== version ||
      views.some((view) => view.snapshot.documentVersion !== version)
    ) {
      throw new Error(
        "The note changed while preparing its rename. Try again.",
      );
    }
    return views;
  }
}
