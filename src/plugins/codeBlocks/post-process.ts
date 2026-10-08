import type { Logger } from "../../kernel";
import type { EditorService } from "../editor/api";
import type { RenderPass } from "../render/api";
import { codePosition } from "./code-selection";

interface CodePassOptions {
  pass: RenderPass;
  cleanups: Set<() => void>;
  isLive(): boolean;
  editor: EditorService;
  logger: Logger;
}

export function bindCodePass(options: CodePassOptions): void {
  const { pass, cleanups } = options;
  let isActive = true;
  const events = new AbortController();
  const copies: HTMLElement[] = [];
  const originals = new Map<HTMLElement, string>();
  const cleanup = () => {
    isActive = false;
    events.abort();
    for (const copy of copies) {
      copy.remove();
    }
    for (const [code, text] of originals) {
      code.textContent = text;
    }
    cleanups.delete(cleanup);
  };
  cleanups.add(cleanup);
  pass.onDispose(cleanup);
  // Only fenced code; other blocks (query results) may contain code elements.
  for (const code of pass.container.querySelectorAll<HTMLElement>(
    "pre > code",
  )) {
    const copy = copyButton(code, options, events.signal);
    copies.push(copy);
    originals.set(code, code.textContent ?? "");
    pass.onDispose(() => copy.remove());
    code.addEventListener(
      "click",
      (event) => {
        if (pass.readOnly) {
          return;
        }
        revealCode({
          code,
          event,
          source: pass.source,
          editor: options.editor,
        });
      },
      { signal: events.signal },
    );
    void import("./code-highlight")
      .then(({ highlight }) => {
        if (options.isLive() && isActive) {
          highlight(code);
          pass.measure();
        }
      })
      .catch((error) => options.logger.warn("Code highlighting failed", error));
  }
}

function copyButton(
  code: HTMLElement,
  { editor, logger }: Pick<CodePassOptions, "editor" | "logger">,
  signal: AbortSignal,
): HTMLButtonElement {
  const pre = code.parentElement!;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-code";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", "Copy code");
  pre.before(copy);
  copy.addEventListener(
    "click",
    () => {
      void editor.clipboard
        .write(code.textContent ?? "")
        .catch((error) => logger.error("Copy failed", error));
    },
    { signal },
  );
  return copy;
}

interface CodeClick {
  code: HTMLElement;
  event: MouseEvent;
  source: string;
  editor: EditorService;
}

function revealCode({ code, event, source, editor }: CodeClick): void {
  const view = editor.view;
  if (!view.dom.contains(code)) {
    return;
  }
  const offset = codePosition(
    source,
    code,
    event,
    /^\s*(```|~~~)/.test(source),
  );
  if (offset === undefined) {
    return;
  }
  const shell = code.closest<HTMLElement>(".hybrid-block");
  if (!shell) {
    return;
  }
  const from = view.posAtDOM(shell) + offset;
  if (from > view.state.doc.length) {
    return;
  }
  view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
  view.focus();
}
