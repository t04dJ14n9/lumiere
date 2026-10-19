import { collab } from "@codemirror/collab";
import { EditorView } from "@codemirror/view";
import type { Endpoint } from "../../shared/rpc/endpoint";
import type { ViewDocument } from "./api";
import { InputGroups } from "./input-groups";
import { Synchronizer } from "./sync";

/** Buffers host updates until the view attaches and commits drafts before flushing. */
export class ViewConnection implements ViewDocument {
  private readonly groups = new InputGroups();
  private readonly commits = new Set<() => void>();
  private sync?: Synchronizer;
  private readonly queue: Parameters<Synchronizer["receive"]>[0][] = [];
  readonly extension;

  constructor(
    config: { version: number; clientID: string },
    private readonly rpc: Endpoint,
    private readonly report: (message: string) => void,
  ) {
    this.extension = [
      collab(config),
      this.groups.extension,
      EditorView.updateListener.of(() =>
        queueMicrotask(() => this.sync?.pump()),
      ),
    ];
  }

  inputGroups(
    vimMode?: ConstructorParameters<typeof InputGroups>[0],
  ): InputGroups {
    return new InputGroups(vimMode);
  }

  beforeFlush(commit: () => void): () => void {
    this.commits.add(commit);
    return () => {
      this.commits.delete(commit);
    };
  }

  attach(view: EditorView): () => void {
    this.groups.attach(view);
    this.sync = new Synchronizer(view, this.rpc, (message) => {
      view.dom.setAttribute("data-sync-status", message);
      this.report(message);
    });
    for (const message of this.queue.splice(0)) {
      this.sync.receive(message);
    }
    return () => {
      this.dispose();
      delete this.sync;
    };
  }

  receive(message: Parameters<Synchronizer["receive"]>[0]): void {
    if (this.sync) {
      this.sync.receive(message);
    } else {
      this.queue.push(message);
    }
  }

  pump(): void {
    this.sync?.pump();
  }

  async flush(): Promise<void> {
    // Unlike notification events, draft failures must reject the save operation.
    for (const commit of this.commits) {
      commit();
    }
    if (!this.sync) {
      throw new Error("Editor not mounted");
    }
    await this.sync.flush();
  }

  get error(): string | undefined {
    return this.sync?.error;
  }
  dispose(): void {
    this.groups.dispose();
    this.sync?.dispose();
  }
}
