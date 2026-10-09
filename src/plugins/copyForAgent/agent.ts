import type { Agent, AgentReference } from "./api";
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
export class AgentReferences implements Agent {
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
  async copy(
    id: string,
    options: {
      interactive?: boolean;
      token?: Cancellation;
      ask?: boolean;
    } = {},
  ): Promise<boolean> {
    const panel = this.options.editors.all().find((item) => item.id === id);
    if (!panel) {
      throw new RpcError("EditorNotFound", "Editor not found");
    }
    this.assertEnabled(panel);
    let selection = await this.options.selections.capture(id, options.token);
    if (!selection) {
      return false;
    }
    this.assertActive(panel, options.token);
    if (panel.document.isDirty || panel.document.isUntitled) {
      if (!options.interactive) {
        throw new RpcError(
          "DocumentDirty",
          "Save the note before copying for agent",
        );
      }
      const choice = await this.options.workbench.views?.ask(
        "This note has unsaved changes. Save it so the reference matches the file?",
        ["Save and Copy", "Copy Text Only", "Cancel"],
      );
      this.assertActive(panel, options.token);
      if (choice === "Copy Text Only") {
        return this.copyText(selection);
      }
      if (choice !== "Save and Copy") {
        return false;
      }
      await this.save(panel);
      selection = await this.options.selections.capture(id, options.token);
      if (!selection) {
        return false;
      }
    }
    this.assertActive(panel, options.token);
    const reference = this.reference(selection);
    const payload = agentPayload(reference.text, selection.text);
    if (options.ask) {
      await this.ask(payload, reference);
      return true;
    }
    await this.options.workbench.clipboard.write(payload);
    return true;
  }
  private async ask(payload: string, reference: AgentReference): Promise<void> {
    const { workbench } = this.options;
    const target = await openAgentChat(
      (command, ...args) => workbench.execute(command, ...args),
      (text) => workbench.clipboard.write(text),
      payload,
      {
        environment: await workbench.agentEnvironment?.(),
        writeScratchFile: workbench.writeScratchFile
          ? (text) =>
              workbench.writeScratchFile!(
                scratchName(reference.text),
                scratchText(text, reference),
              )
          : undefined,
      },
    );
    if (target === "chatWithClipboard") {
      workbench.inform?.("The passage is copied: paste it into the chat.");
    }
    if (target === "codex") {
      workbench.inform?.(
        "The passage is attached in Codex (and copied): type your question.",
      );
    }
    if (target === "clipboard") {
      workbench.inform?.(
        "The passage is copied: paste it into your agent's chat and ask your question.",
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
      config.features?.copyForAgent?.enabled === false
    ) {
      throw new RpcError("PluginDisabled", "Copy for Agent is disabled");
    }
  }
  private assertActive(panel: EditorPanel, token?: Cancellation): void {
    this.assertEnabled(panel);
    if (token?.cancelled || !this.options.editors.all().includes(panel)) {
      throw new RpcError("Cancelled", "Copy cancelled");
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
