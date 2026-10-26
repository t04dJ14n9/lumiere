/**
 * Editing a sketch a note shows: the page names the embed it was tapped on,
 * by its link as written; the host finds the file from the note, opens the
 * canvas on it and writes the new drawing back to the same file.
 */
import type { InkService } from "@workshop/ink/service";
import {
  SKETCH_EXTENSION,
  isSketchPath,
  sketchFromSvg,
  sketchToSvg,
  type Sketch,
} from "@workshop/ink/format";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import {
  decodeLinkPath,
  nameOf,
  type LinkSyntax,
} from "../../shared/vault-path";
import type { Vaults } from "../vault/api";

/** What drawing and saving sketches needs from the host. */
export interface SketchHost {
  readonly ink: InkService;
  readonly files: Pick<
    WorkspaceFiles,
    "readText" | "writeText" | "list" | "mkdir"
  >;
  readonly vaults: Pick<Vaults, "locate">;
  readonly error: (message: string) => void;
}

export interface TappedEmbed {
  readonly target: string;
  readonly syntax: LinkSyntax;
}

/** True once the sketch was drawn again and saved; false if left as it was. */
export async function editSketch(
  host: SketchHost,
  noteUri: string,
  link: TappedEmbed,
): Promise<boolean> {
  const located = await host.vaults.locate(noteUri);
  // As embeds resolve it: a Markdown destination is percent-encoded.
  const target =
    link.syntax === "markdown" ? decodeLinkPath(link.target) : link.target;
  const file = located?.vault.index.resolveLink(
    target,
    located.path,
    link.syntax,
  );
  if (!file || !isSketchPath(file.path)) {
    return false;
  }
  const sketch = await readSketch(host, file);
  if (!sketch) {
    return false;
  }
  const drawn = await draw(host, { sketch, title: sketchTitle(file.path) });
  if (!drawn) {
    return false;
  }
  await host.files.writeText(file.uri, sketchToSvg(drawn));
  return true;
}

async function readSketch(
  host: SketchHost,
  file: { readonly uri: string; readonly path: string },
): Promise<Sketch | undefined> {
  const svg = await host.files.readText(file.uri);
  if (svg === undefined) {
    host.error(`${file.path} could not be read.`);
    return undefined;
  }
  try {
    return sketchFromSvg(svg);
  } catch (error) {
    host.error(
      `${file.path} cannot be edited here: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/** The canvas's answer; a failure to open it (one already open) is shown. */
export async function draw(
  host: SketchHost,
  request: Parameters<InkService["draw"]>[0],
): Promise<Sketch | undefined> {
  try {
    return await host.ink.draw(request);
  } catch (error) {
    host.error(
      `The canvas could not open: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/** What the canvas shows: the file's name without `.sketch.svg`. */
export function sketchTitle(path: string): string {
  const name = nameOf(path);
  return isSketchPath(name) ? name.slice(0, -SKETCH_EXTENSION.length) : name;
}
