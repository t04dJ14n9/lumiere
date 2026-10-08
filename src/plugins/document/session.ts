import { saveDocument } from "./save";
import { Authority } from "../../shared/document/authority";
import type { Prepared } from "../../shared/document/authority";
import type { HostDocument, Workbench, TextEdit } from "../../shared/runtime";
import type { Endpoint } from "../../shared/rpc/endpoint";
import { UndoGroups } from "./undo-groups";
import { protocol } from "./protocol";
import type { DocumentSession } from "./api";
export class Session implements DocumentSession {
  readonly authority: Authority;
  private readonly clients = new Map<string, { rpc: Endpoint; sent: number }>();
  private queue: Promise<unknown> = Promise.resolve();
  private actions: Promise<unknown> = Promise.resolve();
  private expected?: Prepared;
  private readonly groups = new UndoGroups();
  private historyAction = false;
  constructor(
    readonly document: HostDocument,
    private readonly workbench: Workbench,
  ) {
    this.authority = new Authority(document.getText());
  }
  private fingerprint(): string {
    return this.workbench.fingerprint(this.text);
  }
  save(): Promise<boolean> {
    return saveDocument(this.document, this.workbench);
  }
  withAction<T>(action: () => Promise<T>): Promise<T> {
    const result = this.actions.then(action);
    this.actions = result.catch(() => {});
    return result;
  }
  get text(): string {
    return this.authority.doc.toString();
  }
  get version(): number {
    return this.authority.version;
  }
  attach(id: string, rpc: Endpoint) {
    if (this.clients.has(id)) {
      throw new Error("Duplicate panel");
    }
    const client = { rpc, sent: this.version };
    this.clients.set(id, client);
    const stop = rpc.handle(protocol, "push", (params) => {
      const request = this.queue.then(async () => {
        const prepared = this.authority.prepare(
          params.version,
          params.changes,
          id,
        );
        if (!prepared) {
          return true;
        }
        const before = this.fingerprint();
        if (prepared.text.eq(this.authority.doc)) {
          this.authority.record(this.document.getText(), prepared);
          this.broadcast();
          return true;
        }
        const edits: TextEdit[] = [];
        prepared.changes.iterChanges((from, to, _a, _b, insert) =>
          edits.push({
            from,
            to,
            insert: insert.sliceString(0, insert.length, this.document.eol),
          }),
        );
        this.expected = prepared;
        try {
          if (!(await this.workbench.apply(this.document, edits))) {
            throw new Error("The host could not apply the edit.");
          }
          // Real workbenches fire change before apply resolves. Fakes may not.
          if (this.expected) {
            this.changed();
          }
          this.groups.record(
            before,
            this.fingerprint(),
            params.group === undefined ? undefined : `${id}/${params.group}`,
          );
        } finally {
          this.expected = undefined;
        }
        return true;
      });
      this.queue = request.catch(() => {});
      return request;
    });
    return async () => {
      this.clients.delete(id);
      await stop();
    };
  }
  changed(): void {
    if (!this.expected && !this.historyAction) {
      this.groups.clear();
    }
    this.authority.record(this.document.getText(), this.expected);
    this.expected = undefined;
    this.broadcast();
  }
  private broadcast(): void {
    for (const client of this.clients.values()) {
      if (client.sent === this.version) {
        continue;
      }
      client.rpc.notify(protocol, "updates", {
        version: client.sent,
        updates: this.authority.since(client.sent),
      });
      client.sent = this.version;
    }
  }
  async flush(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((client) =>
        client.rpc.call(protocol, "flush", {}, { timeout: 1200 }),
      ),
    );
    await this.queue;
  }
  async history(action: "undo" | "redo"): Promise<void> {
    this.historyAction = true;
    try {
      await this.groups.run(
        action,
        () => this.fingerprint(),
        () => this.workbench.execute(action),
      );
    } finally {
      this.historyAction = false;
    }
  }
}
