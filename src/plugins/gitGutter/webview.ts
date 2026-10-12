import { EditorSelection } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Context, Infer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../render/api";
import type { GitDiff } from "./api";
import { changeGutter } from "./gutter";
import {
  MAX_CHARS,
  MAX_LINES,
  computeHunks,
  hunkAt,
  hunkField,
  revertChange,
  setHunks,
} from "./hunks";
import { config } from "./manifest";
import { peekExtension, peekedHunk, setPeek } from "./peek";
import { protocol } from "./protocol";

type Status = ReturnType<GitDiff["status"]>;
type Options = Infer<typeof config>;

/** Debounce between typing and recomputing the diff. */
export const RECOMPUTE_MS = 250;

/** The baseline, its hunks and the moves between them, for one editor. */
class GitDiffModel implements GitDiff {
  get field() {
    return hunkField;
  }
  private text: string | undefined;
  private name = "HEAD";
  private state: Status = "loading";
  private request = 0;
  private live = true;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly ctx: Context,
    private readonly options: Options,
  ) {}

  get view(): EditorView {
    return this.ctx.editor.view;
  }
  status = () => this.state;
  label = () => this.name;
  baseline = () => this.text;

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.live = false;
    this.listeners.clear();
  }

  revert(hunk: Parameters<GitDiff["revert"]>[0]): void {
    this.view.dispatch({
      changes: revertChange(this.view.state, hunk),
      effects: setPeek.of(null),
      userEvent: "input.revert",
      scrollIntoView: true,
    });
  }

  recompute = (): void => {
    const { doc } = this.view.state;
    const tooLarge = doc.length > MAX_CHARS || doc.lines > MAX_LINES;
    if (this.text !== undefined && tooLarge) {
      this.state = "tooLarge";
    }
    const hunks =
      this.text === undefined || tooLarge ? [] : computeHunks(this.text, doc);
    this.view.dispatch({ effects: setHunks.of(hunks) });
    for (const listener of this.listeners) {
      listener();
    }
  };

  load = async (): Promise<void> => {
    const mine = ++this.request;
    const { compareTo } = this.options;
    try {
      const result = await this.ctx.rpc.call(protocol, "baseline", {
        ref: compareTo,
      });
      if (mine !== this.request || !this.live) {
        return;
      }
      this.state = result.status;
      this.text = result.status === "ok" ? (result.text ?? "") : undefined;
      this.name = result.label ?? (compareTo === "HEAD" ? "HEAD" : "Index");
    } catch (error) {
      if (mine !== this.request || !this.live) {
        return;
      }
      this.ctx.logger.warn("Git baseline unavailable", error);
      this.state = "unavailable";
      this.text = undefined;
    }
    this.recompute();
  };

  /** Move the caret (and an open peek) to the next or previous change, wrapping. */
  move(target: EditorView, direction: 1 | -1, peek: boolean): boolean {
    const { hunks } = target.state.field(hunkField);
    if (hunks.length === 0) {
      return false;
    }
    const open = peekedHunk(target.state);
    const line = target.state.doc.lineAt(target.state.selection.main.head);
    const lineEdge = direction === 1 ? line.to : line.from;
    const anchor = open ? open.from : lineEdge;
    const ordered = direction === 1 ? hunks : [...hunks].reverse();
    const next =
      ordered.find((hunk) =>
        direction === 1 ? hunk.from > anchor : hunk.from < anchor,
      ) ?? ordered[0]!;
    this.ctx.editor.navigate(() =>
      target.dispatch({
        selection: EditorSelection.cursor(next.from),
        effects: [
          EditorView.scrollIntoView(next.from, { y: "center" }),
          ...(peek || open ? [setPeek.of(next.from)] : []),
        ],
      }),
    );
    return true;
  }

  /** Open the peek for the change on these lines, or close it. */
  toggle = (target: EditorView, from: number, to: number): void => {
    const hunk = hunkAt(target.state.field(hunkField).hunks, from, to);
    const open = peekedHunk(target.state);
    target.dispatch({
      effects: setPeek.of(!hunk || open === hunk ? null : hunk.from),
    });
  };

  showChange = (): boolean => {
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    if (hunkAt(state.field(hunkField).hunks, line.from, line.to)) {
      this.toggle(this.view, line.from, line.to);
      return true;
    }
    return this.move(this.view, 1, true);
  };

  stage = async (): Promise<boolean> => {
    const staged = await this.ctx.rpc.call(protocol, "stage", {});
    if (staged) {
      await this.load();
    }
    return staged;
  };
}

/** Recompute the hunks a moment after typing stops. */
function debounce(model: GitDiffModel) {
  return ViewPlugin.define(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      update(update) {
        if (update.docChanged && model.baseline() !== undefined) {
          clearTimeout(timer);
          timer = setTimeout(model.recompute, RECOMPUTE_MS);
        }
      },
      destroy() {
        clearTimeout(timer);
      },
    };
  });
}

export const gitGutterWebview: Plugin<Options> = {
  name: "gitGutter",
  config,
  inject: { required: ["editor", "commands", "render", "rpc"] },
  apply(ctx, options) {
    const model = new GitDiffModel(ctx, options);
    ctx.effect(() => () => model.dispose());
    ctx.provide("gitDiff", model);
    ctx.effect(() =>
      ctx.editor.extend([
        hunkField,
        changeGutter({
          isOpen: (target, from, to) => {
            const open = peekedHunk(target.state);
            return Boolean(open && open.from <= to && open.to >= from);
          },
          click: model.toggle,
        }),
        peekExtension({
          render: ctx.render,
          label: model.label,
          move: (target, direction) => model.move(target, direction, true),
          revert: (_target, hunk) => model.revert(hunk),
          stage: model.stage,
        }),
        debounce(model),
      ]),
    );
    ctx.effect(() => ctx.rpc.on(protocol, "changed", () => void model.load()));
    const commands: [string, () => boolean][] = [
      ["editor:git-next-change", () => model.move(model.view, 1, false)],
      ["editor:git-previous-change", () => model.move(model.view, -1, false)],
      ["editor:git-show-change", model.showChange],
    ];
    for (const [id, run] of commands) {
      ctx.effect(() => ctx.commands.register(id, run));
    }
    void model.load();
  },
};
