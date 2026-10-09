/**
 * A complete external plugin for Markdown Workbench API v1 (API.md).
 *
 * - Markers: a "TODO" badge after every TODO in an open note; clicking one
 *   runs a host action.
 * - Links: claims `ticket:NUMBER` links and opens them in the browser.
 * - Code blocks: renders ```tickets fences (one number per line) as a list
 *   of ticket links.
 * - Commands: `mwsample.tickets.refresh` recomputes the badges.
 */
import type * as vscode from "vscode";
import type {
  EditorSnapshot,
  ExternalPlugin,
  ProcessorResult,
  SourceMarker,
} from "../../../../src/host/api/types";

/** The parts of the `vscode` module the plugin uses. */
export type VSCode = Pick<typeof vscode, "workspace" | "window" | "env" | "Uri">;

/**
 * Markers for every TODO in `text`, in the source offsets of `version`
 * (UTF-16 code units counting CR characters, as VS Code's text has them).
 */
export function todoMarkers(text: string, version: number): SourceMarker[] {
  const markers: SourceMarker[] = [];
  for (const match of text.matchAll(/\bTODO\b/g)) {
    const line = text.slice(0, match.index).split("\n").length;
    markers.push({
      id: `todo-${match.index}`,
      from: match.index,
      to: match.index + match[0].length,
      documentVersion: version,
      label: "TODO",
      tooltip: `TODO on line ${line}. Click for details.`,
      actionId: "describe",
    });
  }
  // The API accepts at most 1,000 markers per plugin and editor.
  return markers.slice(0, 1000);
}

/** The Markdown a ```tickets block renders to. */
export function ticketList(source: string): ProcessorResult {
  const numbers = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{1,9}$/.test(line));
  if (numbers.length === 0) {
    return { markdown: "*No tickets.*" };
  }
  return {
    markdown: numbers
      .map((number) => `- [Ticket ${number}](ticket:${number})`)
      .join("\n"),
  };
}

export function ticketsPlugin(code: VSCode): ExternalPlugin {
  return {
    // Namespaced under the owner's publisher.
    id: "mwsample.tickets",
    ownerExtensionId: "mwsample.tickets",
    title: "Sample Tickets",
    description: "TODO badges, ticket: links and tickets code blocks.",
    defaultEnabled: true,
    // Reading any service not listed here throws UndeclaredService.
    inject: { required: ["editors", "markers", "commands", "codeBlocks"] },
    apply(ctx) {
      const refresh = async (editor: EditorSnapshot) => {
        const document = await code.workspace.openTextDocument(editor.uri);
        // The document may have moved on since the snapshot: markers name
        // the version their offsets belong to, and the editor maps them
        // through any later edits.
        ctx.markers.set(
          editor.editorId,
          todoMarkers(document.getText(), document.version),
        );
      };
      const refreshAll = () =>
        Promise.all(ctx.editors.getEditors().map(refresh));

      // Everything registered through `ctx` ends when the plugin stops
      // (disabled in settings, or its handle disposed).
      ctx.on("editor/opened", (editor) => void refresh(editor));
      ctx.effect(() =>
        code.workspace.onDidChangeTextDocument((event) => {
          const changed = event.document.uri.toString();
          for (const editor of ctx.editors.getEditors()) {
            if (editor.uri.toString() === changed) {
              void refresh(editor);
            }
          }
        }),
      );
      ctx.markers.registerAction("describe", ({ marker }) => {
        void code.window.showInformationMessage(marker.tooltip ?? "TODO");
      });

      // The first plugin to return true claims the link; returning
      // undefined lets Markdown Workbench open it as usual.
      const openTicket = async (number: string): Promise<true> => {
        const base = code.workspace
          .getConfiguration("mwsampleTickets")
          .get<string>("baseUrl", "");
        await code.env.openExternal(code.Uri.parse(`${base}${number}`));
        return true;
      };
      ctx.on("links/open", (request) => {
        const number = /^ticket:(\d{1,9})$/.exec(request.href)?.[1];
        return number ? openTicket(number) : undefined;
      });

      ctx.codeBlocks.register({
        language: "tickets",
        render: (source) => ticketList(source),
      });

      // Command IDs must start with the owner extension's ID.
      ctx.commands.register("mwsample.tickets.refresh", refreshAll);
      void refreshAll();
    },
  };
}
