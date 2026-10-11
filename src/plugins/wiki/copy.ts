import type { BridgeCapture } from "../bridge/api";
import type { WikiPlace } from "./api";
import { wikiContext } from "./context";

export async function copyWikiReference(input: {
  readonly capture: BridgeCapture | undefined;
  readonly place: WikiPlace | undefined;
  readonly noteText: string | undefined;
  readonly json: boolean;
  readonly clipboard: { write(text: string): Promise<void> };
  inform(message: string): void;
  error(message: string): void;
}): Promise<void> {
  if (!canCapture(input.capture)) {
    input.error("Turn on the Bridge plugin to copy a wiki reference.");
    return;
  }
  const handoff = await input.capture.markdownSelection(
    wikiContext(input.place, input.noteText),
  );
  if (!handoff) {
    input.error(
      "Open the note in Markdown Workbench and select the passage to copy.",
    );
    return;
  }
  if (input.json) {
    await writeEnvelope(input, handoff.envelope, Boolean(handoff.text));
    return;
  }
  if (!handoff.text) {
    input.error("Save the note before copying an agent reference.");
    return;
  }
  await input.clipboard.write(handoff.text);
  input.inform("Copied the wiki reference. No agent was started.");
}

function canCapture(
  capture: BridgeCapture | undefined,
): capture is BridgeCapture {
  return Boolean(capture && typeof capture.markdownSelection === "function");
}

async function writeEnvelope(
  input: {
    readonly clipboard: { write(text: string): Promise<void> };
    inform(message: string): void;
  },
  envelope: unknown,
  saved: boolean,
): Promise<void> {
  await input.clipboard.write(JSON.stringify(envelope, null, 2));
  const dirty = saved
    ? "Copied the bridge envelope. No agent was started."
    : "Copied the bridge envelope. Save the note before copying an agent reference. No agent was started.";
  input.inform(dirty);
}
