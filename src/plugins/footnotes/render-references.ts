import { Text } from "@codemirror/state";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { RenderPass, RenderService } from "../render/api";
import { mountReference } from "./reference-widget";
import { prepareFootnotes, type FootnoteReplacement } from "./preprocess";

/** Each render pass owns its mounted references; plugin disposal removes all survivors. */
export class RenderedReferences {
  private readonly references = new WeakMap<
    RenderPass,
    FootnoteReplacement[]
  >();
  private readonly cleanups = new Set<() => void>();
  constructor(
    private readonly document: () => Text,
    private readonly render: RenderService,
    private readonly navigate: (note: Footnote, pass: RenderPass) => void,
  ) {}

  prepare(pass: RenderPass): void {
    if (pass.ancestry.includes("footnote-preview")) {
      return;
    }
    const document =
      pass.documentText === undefined
        ? this.document()
        : Text.of(pass.documentText.split("\n"));
    const nonce = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const prepared = prepareFootnotes(
      pass.source,
      document,
      pass.sourceLine,
      nonce,
    );
    this.references.set(pass, prepared.replacements);
    pass.displaySource = prepared.displaySource;
  }

  mount(pass: RenderPass): void {
    for (const { id, note } of this.references.get(pass) ?? []) {
      const sup = pass.container.querySelector<HTMLElement>(
        `[data-mw-footnote="${id}"]`,
      );
      if (!sup) {
        continue;
      }
      const stop = mountReference(sup, note, {
        render: this.render,
        navigate: () => this.navigate(note, pass),
        measure: pass.measure,
      });
      const cleanup = () => {
        stop();
        sup.textContent = `[^${note.label || note.number}]`;
        this.cleanups.delete(cleanup);
      };
      this.cleanups.add(cleanup);
      pass.onDispose(cleanup);
    }
  }

  dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups.clear();
  }
}
