import {
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
} from "@codemirror/collab";
import { ChangeSet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Endpoint } from "../../shared/rpc/endpoint";
import { protocol } from "./protocol";
import { editGroup } from "./input-annotation";
export class Synchronizer {
  private sending = false;
  private stopped = false;
  error?: string;
  private readonly waiting: { resolve(): void; reject(error: Error): void }[] =
    [];
  constructor(
    private readonly view: EditorView,
    private readonly rpc: Endpoint,
    private readonly status: (message: string) => void,
  ) {}
  receive(message: {
    version: number;
    updates: { clientID: string; changes: unknown }[];
  }): void {
    if (message.version !== getSyncedVersion(this.view.state)) {
      this.fail(
        new Error(
          "Document revisions differ. Keep this tab open and copy your edits before reopening.",
        ),
      );
      return;
    }
    try {
      this.view.dispatch(
        receiveUpdates(
          this.view.state,
          message.updates.map((update) => ({
            clientID: update.clientID,
            changes: ChangeSet.fromJSON(update.changes),
          })),
        ),
      );
    } catch (error) {
      this.fail(error);
    }
    queueMicrotask(() => this.pump());
  }
  pump(): void {
    if (this.stopped || this.error || this.view.composing || this.sending) {
      return;
    }
    const updates = sendableUpdates(this.view.state);
    if (!updates.length) {
      this.status("");
      for (const pending of this.waiting.splice(0)) {
        pending.resolve();
      }
      return;
    }
    this.sending = true;
    this.status("Syncing…");
    const group = updates[0]!.origin.annotation(editGroup);
    const end = updates.findIndex(
      (update) => update.origin.annotation(editGroup) !== group,
    );
    const batch = updates.slice(
      0,
      Math.min(512, end < 0 ? updates.length : end),
    );
    void this.rpc
      .call(protocol, "push", {
        version: getSyncedVersion(this.view.state),
        changes: batch.map((update) => update.changes.toJSON() as unknown[]),
        ...(group === undefined ? {} : { group }),
      })
      .then(
        () => {
          this.sending = false;
          this.pump();
        },
        (error) => this.fail(error),
      );
  }
  flush(): Promise<void> {
    if (this.error || this.stopped) {
      return Promise.reject(new Error(this.error ?? "Document closed"));
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.pump();
    });
  }
  dispose(): void {
    this.stopped = true;
    this.error = "Document closed";
    for (const pending of this.waiting.splice(0)) {
      pending.reject(new Error(this.error));
    }
  }
  private fail(error: unknown): void {
    this.error = String(error);
    this.sending = false;
    this.status(this.error);
    for (const pending of this.waiting.splice(0)) {
      pending.reject(new Error(this.error));
    }
  }
}
