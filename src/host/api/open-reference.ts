import type { Context } from "../../kernel";
import { parseAgentReference } from "../../shared/agent-reference-input";
import { contributionId } from "../../shared/setting-schema";
import type { ApiPlatform } from "./platform";
import type { MarkdownWorkbenchApi } from "./types";
import { resolveReference } from "./reference-target";

/** Explicit fallback when the editor host cannot forward an agent link's range. */
export function registerOpenReference(
  ctx: Context,
  api: MarkdownWorkbenchApi,
  platform: ApiPlatform,
): void {
  ctx.effect(() =>
    ctx.workbench.command(
      contributionId("openCopiedAgentReference"),
      async () => {
        try {
          await openReference(ctx, api, platform);
        } catch (error) {
          ctx.workbench.error(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    ),
  );
}

async function openReference(
  ctx: Context,
  api: MarkdownWorkbenchApi,
  platform: ApiPlatform,
): Promise<void> {
  const views = ctx.workbench.views;
  if (!views) {
    throw new Error("This host does not provide a reference input prompt.");
  }
  // Copy Link for Agent includes a quoted passage below the reference. Only
  // prefill a valid first line; unrelated clipboard content stays private.
  const firstLine =
    (await ctx.workbench.clipboard.read()).split(/\r?\n/, 1)[0] ?? "";
  const value = await views.input({
    prompt:
      "Open a Markdown source reference (@path/to/note.md#12-18 or a full URI)",
    value: referenceError(firstLine) ? "" : firstLine.trim(),
    validate: referenceError,
  });
  if (value === undefined) {
    return;
  }
  const reference = parseAgentReference(value);
  const uri = await resolveReference(reference, ctx.workbench, platform);
  if (uri) {
    await api.open(uri, {
      reveal: { startLine: reference.startLine, endLine: reference.endLine },
    });
  }
}

function referenceError(value: string): string | undefined {
  try {
    parseAgentReference(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
