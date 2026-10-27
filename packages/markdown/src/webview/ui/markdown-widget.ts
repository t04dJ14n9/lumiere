import { WidgetType } from "@codemirror/view";
import { RecentlyUsed } from "../../shared/recently-used";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../plugins/livePreview/api";
import type { RenderPass, RenderService } from "../../plugins/render/api";
import { bindClickToEdit, markdownBlockIgnoresEvent } from "./block-pointer";
import { destroyElement, untilDestroyed } from "./element-lifetime";
import { bindFenceClickGuard } from "./fence-click-guard";
import {
  announceRemount,
  releaseReserveOnceMounted,
} from "./markdown-block-reserve";
import {
  markdownBlockEstimatedHeight,
  unwatchMarkdownBlock,
  watchMarkdownBlock,
} from "./markdown-block-height";
import { selectRenderedSource } from "./source-selection";

/** A span of a block's source, as offsets into it. */
export interface SourceSpan {
  from: number;
  to: number;
}

/** How a rendered block hands over to its source. */
export interface BlockEditing {
  reveal: "click" | "button" | "none";
  guardMargin?: boolean;
  editSummary?: boolean;
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
    return { from: open + 1, to: source.length };
  }
  return close === open
    ? { from: open, to: open }
    : { from: open + 1, to: close };
}

export const FENCED_PREVIEW: BlockEditing = {
  reveal: "button",
  guardMargin: true,
  select: fenceBody,
};

interface RetainedShell {
  readonly shell: HTMLElement;
  readonly edit: HTMLButtonElement;
  readonly body: HTMLElement;
  currentView: EditorView;
  pass?: RenderPass;
  settled: boolean;
  alive: boolean;
  generation: number;
}

const BLOCK_DOM_CACHE_LIMIT = 128;
let blockDomPool = new WeakMap<
  RenderService,
  RecentlyUsed<string, RetainedShell>
>();
let renderGenerations = new WeakMap<RenderService, number>();

function currentRenderGeneration(render: RenderService): number {
  return renderGenerations.get(render) ?? 0;
}

/** Evict pooled off-viewport block shells when render/changed invalidates rendered output. */
export function evictMarkdownBlockDomPool(render: RenderService): void {
  renderGenerations.set(render, currentRenderGeneration(render) + 1);
  const pool = blockDomPool.get(render);
  if (!pool) {
    return;
  }
  blockDomPool.delete(render);
  for (const entry of pool.values()) {
    retire(entry);
  }
}

function isShellSettled(
  entry: RetainedShell | undefined,
  render: RenderService,
): boolean {
  if (
    !entry ||
    !entry.settled ||
    !entry.alive ||
    entry.generation !== currentRenderGeneration(render)
  ) {
    return false;
  }
  return !entry.shell.classList?.contains?.("render-error");
}

function isShellReusable(
  entry: RetainedShell | undefined,
  render: RenderService,
): boolean {
  return Boolean(
    entry && !entry.shell.isConnected && isShellSettled(entry, render),
  );
}

function takePooledShell(
  render: RenderService,
  key: string,
): RetainedShell | undefined {
  const entry = blockDomPool.get(render)?.get(key);
  return isShellReusable(entry, render) ? entry : undefined;
}

/** A pooled block that leaves the pool while out of the page is done for. */
function retire(entry: RetainedShell): void {
  if (!entry.shell.isConnected) {
    entry.alive = false;
    void entry.pass?.dispose();
  }
}

function rememberPooledShell(
  render: RenderService,
  key: string,
  entry: RetainedShell,
): void {
  let pool = blockDomPool.get(render);
  if (!pool) {
    pool = new RecentlyUsed<string, RetainedShell>(
      BLOCK_DOM_CACHE_LIMIT,
      (_key, oldest) => retire(oldest),
    );
    blockDomPool.set(render, pool);
  }
  const prev = pool.get(key);
  if (prev && prev !== entry) {
    retire(prev);
  }
  pool.set(key, entry);
}

/**
 * A rendered Markdown block (callout, formula, diagram, embed, HTML). It owns
 * its render pass, and a finished block goes to a pool when it scrolls out,
 * so it comes back drawn instead of rendering again.
 */
export class MarkdownBlock extends WidgetType {
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

  // The note's width comes from markdownBlockWidthTracker: reading it here
  // forced a layout for every block CodeMirror mounted.
  override toDOM(view: EditorView): HTMLElement {
    const poolKey = `${this.block.kind}\0${this.editing.reveal}\0${this.editing.guardMargin ? 1 : 0}\0${this.editing.editSummary ? 1 : 0}\0${this.block.source}`;
    // The pool alone keeps finished blocks, so its limit bounds what stays
    // in memory; a widget holding its last block kept every diagram alive.
    const reusable = takePooledShell(this.render, poolKey);
    if (reusable) {
      reusable.currentView = view;
      this.mountShell(view, reusable, poolKey);
      announceRemount(reusable.body);
      releaseReserveOnceMounted(view, reusable.shell, reusable.body);
      return reusable.shell;
    }
    const created = this.createShell(view);
    this.mountShell(view, created, poolKey);
    beginMarkdownBlockRender({
      entry: created,
      block: this.block,
      render: this.render,
      onSettled: () => {
        if (isShellSettled(created, this.render)) {
          rememberPooledShell(this.render, poolKey, created);
        }
      },
    });
    releaseReserveOnceMounted(view, created.shell, created.body);
    return created.shell;
  }

  private createShell(view: EditorView): RetainedShell {
    const shell = document.createElement("section");
    shell.className = `hybrid-block hybrid-${this.block.kind}`;
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
    return {
      shell,
      edit,
      body,
      currentView: view,
      settled: false,
      alive: true,
      generation: currentRenderGeneration(this.render),
    };
  }

  private mountShell(
    view: EditorView,
    entry: RetainedShell,
    poolKey: string,
  ): void {
    const events = new AbortController();
    const reveal = () => this.revealSource(view, entry.shell);
    entry.edit.addEventListener("click", reveal, { signal: events.signal });
    if (this.editing.reveal === "click") {
      bindClickToEdit(
        entry.shell,
        reveal,
        events.signal,
        this.editing.editSummary,
      );
    }
    if (this.editing.guardMargin) {
      bindFenceClickGuard(view, entry.shell, this.block, events.signal);
    }
    untilDestroyed(entry.shell, () => {
      events.abort();
      if (isShellSettled(entry, this.render)) {
        rememberPooledShell(this.render, poolKey, entry);
      } else {
        entry.alive = false;
        blockDomPool.get(this.render)?.delete(poolKey);
        void entry.pass?.dispose();
      }
    });
    watchMarkdownBlock(entry.shell, this.block.source);
  }

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

  override ignoreEvent(event: Event): boolean {
    return markdownBlockIgnoresEvent(event);
  }

  override destroy(dom: HTMLElement): void {
    unwatchMarkdownBlock(dom);
    destroyElement(dom);
  }

  override get estimatedHeight(): number {
    return markdownBlockEstimatedHeight(this.block.source);
  }
}

/** Test helper: forget pooled block shells. */
export function clearMarkdownBlockPool(): void {
  blockDomPool = new WeakMap<
    RenderService,
    RecentlyUsed<string, RetainedShell>
  >();
  renderGenerations = new WeakMap<RenderService, number>();
}

function beginMarkdownBlockRender(options: {
  entry: RetainedShell;
  block: RenderBlock;
  render: RenderService;
  onSettled: () => void;
}): void {
  const { entry, block, render, onSettled } = options;
  const { shell, body } = entry;
  void render
    .into(body, block.source, {
      sourceLine: entry.currentView.state.doc.lineAt(block.from).number - 1,
      measure: () => {
        if (entry.alive) {
          releaseReserveOnceMounted(entry.currentView, shell, body);
          if (shell.isConnected) {
            entry.currentView.requestMeasure();
          }
        }
      },
    })
    .then((result) => {
      entry.pass = result;
      if (entry.alive) {
        entry.settled = true;
        onSettled();
      } else {
        void result.dispose();
      }
    })
    .catch(() => {
      if (entry.alive) {
        body.textContent = block.source;
        shell.classList.add("render-error");
        releaseReserveOnceMounted(entry.currentView, shell, body);
        entry.currentView.requestMeasure();
      }
    });
}

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
