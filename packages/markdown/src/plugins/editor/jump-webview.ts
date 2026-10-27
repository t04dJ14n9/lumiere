import { observeReader } from "./navigation";
import { afterLayout } from "./layout";
import { getSyncedVersion } from "@codemirror/collab";
import { EditorView } from "@codemirror/view";
import type { Context, Infer } from "@workshop/core";
import type { Cancellation } from "../../shared/rpc/lifecycle";
import type { EditorService } from "./api";
import { mapAnchor, type JumpAnchor } from "./jump-history";
import type { createViewState } from "./view-state";
import { protocol } from "./jump-protocol";
type Presentation = ReturnType<typeof createViewState>;
type ReplayTarget = Infer<typeof protocol.requests.restore.params>;

export function registerJumpRecorder(
  ctx: Context,
  editor: EditorService,
  presentation: Presentation,
): void {
  const recorder = new JumpRecorder(ctx, editor, presentation);
  recorder.observe();
  ctx.effect(() => observeReader(editor.view, () => recorder.stamp()));
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "navigationState", () => recorder.stamp()),
  );
  ctx.effect(() => () => recorder.dispose());
  ctx.effect(() => editor.onNavigate(() => recorder.begin()));
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "capture", () => recorder.capture()),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "restore", (target, token) =>
      recorder.restore(target, token),
    ),
  );
}

class JumpRecorder {
  private readonly session = crypto
    .getRandomValues(new Uint32Array(4))
    .join("-");
  private generation = 0;
  private startedAttempt = 0;
  private live = true;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly queued = new Set<{
    before: JumpAnchor;
    after: JumpAnchor;
  }>();

  constructor(
    private readonly ctx: Context,
    private readonly editor: EditorService,
    private readonly presentation: Presentation,
  ) {}

  observe(): void {
    const { ctx, editor } = this;
    ctx.effect(() =>
      editor.extend(
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) {
            this.generation++;
          }
          if (update.docChanged) {
            for (const jump of this.queued) {
              jump.before = mapAnchor(jump.before, (at) =>
                update.changes.mapPos(at, 1),
              );
              jump.after = mapAnchor(jump.after, (at) =>
                update.changes.mapPos(at, 1),
              );
            }
          }
        }),
      ),
    );
    ctx.effect(() => {
      const controller = new AbortController();
      for (const event of ["wheel", "pointerdown", "keydown", "touchstart"]) {
        editor.view.dom.addEventListener(
          event,
          () => {
            this.generation++;
          },
          // Passive: a blocking wheel listener makes every scroll wait
          // for the main thread.
          {
            capture: true,
            passive: true,
            signal: controller.signal,
          },
        );
      }
      return () => controller.abort();
    });
  }

  begin(): () => void {
    const before = captureAnchor(this.editor, this.presentation);
    return () => {
      this.generation++;
      const jump = {
        before,
        after: captureAnchor(this.editor, this.presentation),
      };
      this.queued.add(jump);
      this.pending = this.pending
        .then(async () => {
          await this.ctx.document.flush();
          if (!this.live) {
            return;
          }
          const accepted = await this.ctx.rpc.call(protocol, "record", {
            ...jump,
            version: getSyncedVersion(this.editor.view.state),
          });
          if (!accepted) {
            throw new Error("Document changed while recording a jump");
          }
        })
        .catch((error) =>
          this.ctx.logger.warn("Jump history capture failed", error),
        )
        .finally(() => this.queued.delete(jump));
    };
  }

  stamp() {
    return { session: this.session, generation: this.generation };
  }

  async capture() {
    await this.pending;
    await this.ctx.document.flush();
    return {
      anchor: captureAnchor(this.editor, this.presentation),
      startedAttempt: this.startedAttempt,
      generation: this.generation,
      session: this.session,
      version: getSyncedVersion(this.editor.view.state),
    };
  }

  async restore(target: ReplayTarget, token: Cancellation): Promise<boolean> {
    const view = this.editor.view;
    if (
      token.cancelled ||
      target.session !== this.session ||
      !this.live ||
      target.generation !== this.generation ||
      target.version !== getSyncedVersion(view.state)
    ) {
      return false;
    }
    this.startedAttempt = target.attempt ?? this.startedAttempt;
    // Native focus may restore its previous viewport; establish it first.
    view.focus();
    this.ctx.emit("editor/clearProjection");
    // Bypass the deliberate-jump recorder, not unrelated jumps during layout.
    this.presentation.restoreViewState(
      view,
      savedAnchor(this.editor, target.anchor),
    );
    const appliedGeneration = this.generation;
    const applied =
      (await afterLayout(view)) &&
      !token.cancelled &&
      this.live &&
      appliedGeneration === this.generation &&
      target.version === getSyncedVersion(view.state);
    return applied;
  }

  dispose(): void {
    this.live = false;
    this.generation++;
    this.queued.clear();
  }
}

function savedAnchor(editor: EditorService, anchor: JumpAnchor) {
  return {
    source: editor.source,
    mode: editor.mode,
    anchor: anchor.selection.anchor,
    head: anchor.selection.head,
    scrollAnchor: { from: anchor.scroll.from, offset: anchor.scroll.offset },
    scrollLeft: anchor.scroll.left,
    scrollTop: anchor.scroll.top,
    contributions: {},
    folded: [],
    folds: {},
  };
}

function captureAnchor(
  editor: EditorService,
  presentation: Presentation,
): JumpAnchor {
  const view = editor.view;
  const selection = view.state.selection.main;
  const state = presentation.captureViewState(view, {
    source: editor.source,
    mode: editor.mode,
    anchor: selection.anchor,
    head: selection.head,
    scrollLeft: view.scrollDOM.scrollLeft,
    scrollTop: view.scrollDOM.scrollTop,
    contributions: {},
    folded: [],
    folds: {},
  });
  return {
    selection: { anchor: selection.anchor, head: selection.head },
    scroll: {
      from: state.scrollAnchor?.from ?? selection.head,
      offset: state.scrollAnchor?.offset ?? 0,
      left: state.scrollLeft,
      top: state.scrollTop,
    },
  };
}
