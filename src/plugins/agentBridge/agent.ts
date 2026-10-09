import type {
  Editors,
  Selections,
  SourceSelection,
  EditorPanel,
} from "../editor/api";
import type { Workbench } from "../../shared/runtime";
import { RpcError, type Cancellation } from "../../shared/rpc/lifecycle";
import { agentPayload, agentReferenceText } from "./reference";
import { openAgentChat } from "./chat";
/** A saved note's line reference: `@notes/a.md#12-18` (LLM Wiki wording). */
export interface AgentReference {
  readonly text: string;
  readonly uri: string;
  readonly startLine: number;
  readonly endLine: number;
}
/** Copy Link for Agent: the reference and quoted passage, to the agent chat. */
export class AgentHandoff {
  private live = true;
  dispose(): void {
    this.live = false;
  }
  constructor(
    private readonly options: {
      editors: Editors;
      selections: Selections;
      workbench: Workbench;
      beforeSave(panel: EditorPanel): Promise<void>;
    },
  ) {}
  reference(selection: SourceSelection): AgentReference {
    const panel = this.options.selections.validate(selection);
    this.assertEnabled(panel);
    if (panel.document.isDirty || panel.document.isUntitled) {
      throw new RpcError(
        "DocumentDirty",
        "Save the note before creating an agent reference",
      );
    }
    const uri = panel.document.uri;
    return Object.freeze({
      text: agentReferenceText(
        uri,
        this.options.workbench.workspaceFolders?.() ?? [],
        selection.startLine,
        selection.endLine,
      ),
      uri,
      startLine: selection.startLine,
      endLine: selection.endLine,
    });
  }
  /**
   * Copy the editor's selection with its link, opening a chat only when the
   * editor's own chat is the only agent or a target is forced. An unsaved
   * note asks first: save so the link matches the file, copy the text only,
   * or cancel.
   */
  async copy(id: string, token?: Cancellation): Promise<boolean> {
    const panel = this.options.editors.all().find((item) => item.id === id);
    if (!panel) {
      throw new RpcError("EditorNotFound", "Editor not found");
    }
    this.assertEnabled(panel);
    let selection = await this.options.selections.capture(id, token);
    if (!selection) {
      return false;
    }
    this.assertActive(panel, token);
    if (panel.document.isDirty || panel.document.isUntitled) {
      const choice = await this.options.workbench.views?.ask(
        "This note has unsaved changes. Save it so the reference matches the file?",
        ["Save and Copy", "Copy Text Only", "Cancel"],
      );
      this.assertActive(panel, token);
      if (choice === "Copy Text Only") {
        return this.copyText(selection);
      }
      if (choice !== "Save and Copy") {
        return false;
      }
      await this.save(panel);
      selection = await this.options.selections.capture(id, token);
      if (!selection) {
        return false;
      }
    }
    this.assertActive(panel, token);
    const reference = this.reference(selection);
    await this.send(agentPayload(reference.text, selection.text), reference);
    return true;
  }
  private async send(
    payload: string,
    reference: AgentReference,
  ): Promise<void> {
    const { workbench } = this.options;
    const environment = await workbench.agentEnvironment?.();
    const target = await openAgentChat(
      (command, ...args) => workbench.execute(command, ...args),
      (text) => workbench.clipboard.write(text),
      payload,
      {
        ...(environment && { environment }),
        ...(workbench.writeScratchFile && {
          writeScratchFile: (text: string) =>
            workbench.writeScratchFile!(
              scratchName(reference.text),
              scratchText(text, reference),
            ),
        }),
      },
    );
    if (target === "chatWithClipboard") {
      workbench.inform?.("Link and passage copied: paste them into the chat.");
    }
    if (target === "codex") {
      workbench.inform?.(
        "Link and passage copied and attached in Codex: type your question.",
      );
    }
    if (target === "clipboard") {
      workbench.inform?.(
        "Link and passage copied: paste them into your agent's chat.",
      );
    }
  }
  private async copyText(selection: SourceSelection): Promise<boolean> {
    this.options.selections.validate(selection);
    await this.options.workbench.clipboard.write(selection.text);
    return true;
  }
  private async save(panel: EditorPanel): Promise<void> {
    await panel.session.withAction(async () => {
      await this.options.beforeSave(panel);
      await panel.session.flush();
      if (!(await panel.session.save())) {
        throw new RpcError("SourceChanged", "The note was not saved");
      }
    });
  }
  private assertEnabled(panel: EditorPanel): void {
    const config = this.options.workbench.config(panel.document);
    if (
      !this.live ||
      config.preset !== "obsidian" ||
      config.features?.agentBridge?.enabled === false
    ) {
      throw new RpcError("PluginDisabled", "Copy Link for Agent is disabled");
    }
  }
  private assertActive(panel: EditorPanel, token?: Cancellation): void {
    this.assertEnabled(panel);
    if (token?.cancelled || !this.options.editors.all().includes(panel)) {
      throw new RpcError("Cancelled", "Copy Link for Agent cancelled");
    }
  }
}

/** `@notes/a.md#5-6` -> `a.md-5-6.md`: a readable name for Codex's attachment chip. */
export function scratchName(reference: string): string {
  const last = reference.replace(/^@/, "").split(/[\\/]/).pop() ?? "note";
  const name = last.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${name || "note"}.md`;
}

/**
 * The attached file lives outside the workspace, so it names the note too:
 * otherwise Codex has to search the disk for the relative `@path`.
 */
export function scratchText(
  payload: string,
  reference: AgentReference,
): string {
  return `${payload}\n\nNote file: ${reference.uri} (lines ${reference.startLine}-${reference.endLine})\n`;
}
