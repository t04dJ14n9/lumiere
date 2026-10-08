import { Facet } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import type { BlockRenderer, InlineRenderer } from "./api";
export const blockRenderers = Facet.define<
  BlockRenderer,
  readonly BlockRenderer[]
>({
  combine: (values) => values,
});
export const inlineRenderers = Facet.define<
  InlineRenderer,
  readonly InlineRenderer[]
>({
  combine: (values) => values,
});
/** Inclusive endpoints keep source visible at a block's last character. */
export function revealed(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}
