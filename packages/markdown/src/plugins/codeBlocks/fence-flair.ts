import type { EditorState } from "@codemirror/state";
import { revealRanges } from "../../webview/ui/pointer-selection";
import { WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { languageLabel } from "./code-label";

/**
 * Whether Live Preview shows a fence's source: the same inclusive test as
 * its block reveal, so the label is exactly where the fence text is hidden.
 */
export function fenceRevealed(
  state: EditorState,
  node: { from: number; to: number },
): boolean {
  return revealRanges(state).some(
    (range) => range.from <= node.to && range.to >= node.from,
  );
}

/** The fence's language word and its code text. */
export function fenceInfo(
  state: EditorState,
  node: SyntaxNodeRef,
): { language: string | undefined; code: string } {
  const info = node.node.getChild("CodeInfo");
  const text = node.node.getChild("CodeText");
  return {
    language:
      (info && /^[\w-]+/.exec(state.sliceDoc(info.from, info.to))?.[0]) ||
      undefined,
    code: text ? state.sliceDoc(text.from, text.to) : "",
  };
}

/**
 * The language label and copy button inside the hidden opening fence line.
 * A zero-width space keeps the line's own height (its line box), so the
 * line is exactly as tall as the fence text it stands in for.
 */
export class FenceFlair extends WidgetType {
  constructor(
    readonly language: string | undefined,
    readonly code: string,
    private readonly copy: (text: string) => void,
  ) {
    super();
  }
  override eq(other: FenceFlair): boolean {
    return other.language === this.language && other.code === this.code;
  }
  override toDOM(): HTMLElement {
    const flair = document.createElement("span");
    flair.className = "md-code-flair";
    flair.append("\u200b");
    const label = this.language && languageLabel(`language-${this.language}`);
    if (label) {
      const tag = document.createElement("span");
      tag.className = "code-language";
      tag.textContent = label;
      flair.append(tag);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      this.copy(this.code);
    });
    flair.append(button);
    return flair;
  }
  override ignoreEvent(event: Event): boolean {
    // The button handles its own clicks; elsewhere the line takes the caret.
    return (
      event.target instanceof HTMLElement &&
      event.target.closest(".copy-code") !== null
    );
  }
}

/** Class on the opening fence line while the pointer is anywhere in that fence. */
export const FENCE_HOVERED = "is-fence-hovered";

/**
 * The opening fence line for a Live Preview code line, or null when the line
 * is not part of a fenced block (e.g. indented code has no flair).
 */
export function fenceOpenLine(from: Element | null): HTMLElement | null {
  let line: Element | null =
    from && from.classList.contains("md-code-line") ? from : null;
  while (line?.classList.contains("md-code-line")) {
    if (line.classList.contains("md-code-fence-open")) {
      return line as HTMLElement;
    }
    line = line.previousElementSibling;
  }
  return null;
}

/** Mark the opening fence whose body (or strip) holds the pointer. */
export function setFenceHover(
  root: ParentNode,
  open: HTMLElement | null,
): void {
  for (const el of root.querySelectorAll(
    `.md-code-fence-open.${FENCE_HOVERED}`,
  )) {
    if (el !== open) {
      el.classList.remove(FENCE_HOVERED);
    }
  }
  open?.classList.add(FENCE_HOVERED);
}
