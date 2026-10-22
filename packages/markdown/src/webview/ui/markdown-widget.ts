import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../plugins/livePreview/api";
import type { RenderPass, RenderService } from "../../plugins/render/api";
import { bindClickToEdit, markdownBlockIgnoresEvent } from "./block-pointer";
import { bindFenceClickGuard } from "./fence-click-guard";
import {
  markdownBlockEstimatedHeight,
  rememberMarkdownBlockContentWidth,
  rememberMarkdownBlockHeight,
} from "./markdown-block-height";
import { selectRenderedSource } from "./source-selection";

/** A span of a block's source, as offsets into it. */
export interface SourceSpan {
  from: number;
  to: number;
}

/** How a rendered block hands over to its source. */
export interface BlockEditing {
  /**
   * What reveals the source besides the caret moving in: a click on the
   * block or its Edit button ("click", as for math), or only the
   * Edit button ("button"), so that clicks reach the content of embeds and
   * diagrams, or nothing at all ("none": no Edit button, as on an image,
   * which its own keys edit).
   */
  reveal: "click" | "button" | "none";
  /** Also keep clicks in the editor margin beside the block from revealing it. */
  guardMargin?: boolean;
  /** Summary text edits source; buttons inside it still own their events. */
  editSummary?: boolean;
  /**
   * The part of the source revealing selects; the whole block unless given.
   * Obsidian selects a formula or a diagram's code without its delimiters.
   */
  select?: (source: string) => SourceSpan;
}

/**
 * The body of a fenced block: its lines between the fences, or, when it has
 * none, the end of the opening line.
 */
export function fenceBody(source: string): SourceSpan {
  const open = source.indexOf("\n");
  if (open < 0) {
    return { from: source.length, to: source.length };
  }
  const close = source.lastIndexOf("\n");
  if (!/^ {0,3}(`{3,}|~{3,})\s*$/u.test(source.slice(close + 1))) {
    // Unclosed: the body runs to the end.
    return { from: open + 1, to: source.length };
  }
  return close === open
    ? { from: open, to: open }
    : { from: open + 1, to: close };
}

/**
 * Rendered fenced code (diagrams, queries, processed code): as in Obsidian,
 * only the Edit button reveals it, selecting the code between the fences.
 */
export const FENCED_PREVIEW: BlockEditing = {
  reveal: "button",
  guardMargin: true,
  select: fenceBody,
};

/** Observe block growth so remounts keep painted height (wrap/CSS/iframe). */
const blockObservers = new WeakMap<HTMLElement, ResizeObserver>();

function watchMarkdownBlock(dom: HTMLElement, source: string): void {
  if (!source || blockObservers.has(dom)) {
    return;
  }
  // Unit stubs and older jsdom have no ResizeObserver.
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  const observer = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height ?? 0;
    if (height > 0) {
      rememberMarkdownBlockHeight(source, height);
    }
  });
  observer.observe(dom);
  blockObservers.set(dom, observer);
}

function unwatchMarkdownBlock(dom: HTMLElement, source: string): void {
  blockObservers.get(dom)?.disconnect();
  blockObservers.delete(dom);
  // Unit stubs omit getBoundingClientRect; skip measure then.
  if (typeof dom.getBoundingClientRect !== "function") {
    return;
  }
  const height = dom.getBoundingClientRect().height;
  if (height > 0) {
    rememberMarkdownBlockHeight(source, height);
  }
}

/** Own a render pass even when an async post-processor finishes after removal. */
export class MarkdownBlock extends WidgetType {
  private readonly lifetimes = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly block: RenderBlock,
    private readonly render: RenderService,
    private readonly editing: BlockEditing = { reveal: "click" },
  ) {
    super();
  }

  override eq(other: MarkdownBlock): boolean {
    return (
      this.render === other.render && this.block.source === other.block.source
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    rememberMarkdownBlockContentWidth(view.contentDOM?.clientWidth ?? 0);
    const shell = document.createElement("section");
    shell.className = `hybrid-block hybrid-${this.block.kind}`;
    // Async renders (Mermaid SVG, MathJax) paint short until ready. Remounts
    // inside CodeMirror's draw margin measure that short shell and collapse
    // the height map (~182 vs ~638) even when estimatedHeight is honest.
    // minHeight keeps the reserve until measure sees the finished paint.
    // Unit tests may stub createElement without a CSSStyleDeclaration.
    const reserve = this.estimatedHeight;
    if (reserve > 0 && shell.style) {
      shell.style.minHeight = `${reserve}px`;
    }
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-block";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${this.block.kind} source`);
    const body = document.createElement("div");
    if (this.editing.reveal === "none") {
      shell.append(body);
    } else {
      shell.append(edit, body);
    }
    let live = true;
    let pass: RenderPass | undefined;
    const events = new AbortController();
    const reveal = () => this.revealSource(view, shell);
    edit.addEventListener("click", reveal, { signal: events.signal });
    if (this.editing.reveal === "click") {
      bindClickToEdit(shell, reveal, events.signal, this.editing.editSummary);
    }
    if (this.editing.guardMargin) {
      bindFenceClickGuard(view, shell, this.block, events.signal);
    }
    this.lifetimes.set(shell, () => {
      live = false;
      events.abort();
      void pass?.dispose();
    });
    beginMarkdownBlockRender({
      view,
      shell,
      body,
      block: this.block,
      render: this.render,
      isLive: () => live,
      setPass: (result) => {
        pass = result;
      },
    });
    watchMarkdownBlock(shell, this.block.source);
    return shell;
  }

  /**
   * Reveal the source, selecting what `editing.select` names, with the head
   * at its start as in Obsidian. The block was on screen, so do not scroll.
   */
  private revealSource(view: EditorView, shell: HTMLElement): void {
    const { source } = this.block;
    const start = sourceStart(view, shell, source);
    const span = this.editing.select?.(source) ?? {
      from: 0,
      to: source.length,
    };
    selectRenderedSource(
      view,
      { from: start + span.from, to: start + span.to },
      { settled: true },
    );
  }

  /**
   * Keep widget events (including blank diagram area) so CodeMirror does not
   * park the caret inside the replaced fence on click — that would reveal
   * Mermaid/math source without Edit / click-to-edit. Buttons and Mermaid SVG
   * labels stay native; document-level MouseSelection still covers drags that
   * start outside the widget.
   */
  override ignoreEvent(event: Event): boolean {
    return markdownBlockIgnoresEvent(event);
  }

  override destroy(dom: HTMLElement): void {
    unwatchMarkdownBlock(dom, this.block.source);
    this.lifetimes.get(dom)?.();
    this.lifetimes.delete(dom);
  }

  override get estimatedHeight(): number {
    return markdownBlockEstimatedHeight(this.block.source);
  }
}

function beginMarkdownBlockRender(options: {
  view: EditorView;
  shell: HTMLElement;
  body: HTMLElement;
  block: RenderBlock;
  render: RenderService;
  isLive: () => boolean;
  setPass: (pass: RenderPass) => void;
}): void {
  const { view, shell, body, block, render, isLive, setPass } = options;
  void render
    .into(body, block.source, {
      sourceLine: view.state.doc.lineAt(block.from).number - 1,
      measure: () => {
        if (isLive()) {
          releasePaintReserve(shell, body);
          view.requestMeasure();
        }
      },
    })
    .then((result) => {
      setPass(result);
      if (!isLive()) {
        void result.dispose();
      }
    })
    .catch(() => {
      if (isLive()) {
        body.textContent = block.source;
        shell.classList.add("render-error");
        view.requestMeasure();
      }
    });
}

/** Drop estimatedHeight minHeight once the body has painted height (BH-007). */
function releasePaintReserve(shell: HTMLElement, body: HTMLElement): void {
  if (shell.style.minHeight && body.getBoundingClientRect().height > 0) {
    shell.style.minHeight = "";
  }
}

/**
 * Where a block's source starts. Its widget either replaces the source, or
 * follows it as the preview of a block being edited. The offsets captured
 * when the widget was made go stale when text above changes, so read them
 * from the document.
 */
function sourceStart(
  view: EditorView,
  shell: HTMLElement,
  source: string,
): number {
  const at = view.posAtDOM(shell);
  return view.state.sliceDoc(at, at + source.length) === source
    ? at
    : Math.max(0, at - source.length);
}
