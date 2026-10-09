import type { Protocol } from "../../kernel/protocol";
import type { Infer, Schema } from "../../kernel/schema";
import type { Disposer } from "../../kernel/types";
import type { Logger } from "../../kernel/logger";
import { silentLogger } from "../../kernel/logger";
import { parseEnvelope } from "./envelope";
import type { Envelope, Message } from "./envelope";
import type { Transport, Clock, Cancellation } from "./lifecycle";
import { CancelToken, RpcError } from "./lifecycle";
export { CancelToken, RpcError } from "./lifecycle";
export type { Transport, Clock, Cancellation } from "./lifecycle";
type Handler = {
  protocol: Protocol;
  run: (value: unknown, token: Cancellation) => unknown;
};
type Pending = {
  schema: Schema<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
};
interface OutgoingRequest {
  protocol: Protocol;
  method: string;
  parsed: unknown;
  schema: Schema<unknown>;
  options: { timeout?: number; token?: Cancellation };
}
type Notify = Extract<Message, { kind: "notify" }>;
/**
 * Typed requests and notifications over one transport.
 *
 * Invariants:
 * - Envelopes leave in the order they were produced, except that a
 *   coalesced notification (`notify(..., { coalesce: true })`) replaces an
 *   unsent one for the same channel and method, keeping the first one's place.
 * - Coalesced notifications leave together as one versioned `batch`, at the
 *   latest just before the next request, response, error, cancel or plain
 *   notification, so a request never overtakes the state it depends on.
 * - A received batch with a version not above the last applied one is
 *   dropped whole; its notifications run in order.
 */
export class Endpoint {
  private next = 1;
  private batchVersion = 0;
  private receivedBatch = 0;
  private queued: Notify[] = [];
  private flushScheduled = false;
  private disposed = false;
  private readonly handlers = new Map<string, Handler>();
  private readonly notifications = new Map<string, Set<Handler>>();
  private readonly pending = new Map<number, Pending>();
  private readonly incoming = new Map<
    number,
    { token: CancelToken; key: string }
  >();
  private readonly unlisten: Disposer;
  constructor(
    private readonly transport: Transport,
    private readonly clock: Clock,
    private readonly logger: Logger = silentLogger,
  ) {
    this.unlisten = transport.listen((value) => {
      void this.receive(value);
    });
  }
  private key(protocol: Protocol, method: string): string {
    return `${protocol.id}/${method}`;
  }
  private assertLive(): void {
    if (this.disposed) {
      throw new RpcError("Disposed", "RPC endpoint disposed");
    }
  }
  private send(value: Envelope): void {
    this.assertLive();
    this.flush();
    this.transport.send(parseEnvelope(value));
  }
  /** Send the coalesced notifications now, as one batch. */
  flush(): void {
    if (this.disposed || this.queued.length === 0) {
      return;
    }
    const messages = this.queued;
    this.queued = [];
    this.transport.send(
      parseEnvelope({ kind: "batch", version: ++this.batchVersion, messages }),
    );
  }
  private enqueue(message: Notify): void {
    const index = this.queued.findIndex(
      (item) =>
        item.channel === message.channel && item.method === message.method,
    );
    if (index === -1) {
      this.queued.push(message);
    } else {
      this.queued[index] = message;
    }
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      void Promise.resolve().then(() => {
        this.flushScheduled = false;
        this.flush();
      });
    }
  }
  handle<P extends Protocol, M extends keyof P["requests"] & string>(
    protocol: P,
    method: M,
    run: (
      params: Infer<P["requests"][M]["params"]>,
      token: Cancellation,
    ) =>
      | Infer<P["requests"][M]["result"]>
      | Promise<Infer<P["requests"][M]["result"]>>,
  ): Disposer {
    this.assertLive();
    const key = this.key(protocol, method);
    if (this.handlers.has(key)) {
      throw new RpcError("DuplicateContribution", key);
    }
    const handler = { protocol, run: run as Handler["run"] };
    this.handlers.set(key, handler);
    return () => {
      if (this.handlers.get(key) !== handler) {
        return;
      }
      this.handlers.delete(key);
      for (const [id, request] of this.incoming) {
        if (request.key === key) {
          request.token.cancel();
          this.incoming.delete(id);
          this.sendError(id, "PluginDisabled", key);
        }
      }
    };
  }
  on<P extends Protocol, M extends keyof P["notifications"] & string>(
    protocol: P,
    method: M,
    run: (params: Infer<P["notifications"][M]>) => void | Promise<void>,
  ): Disposer {
    this.assertLive();
    const key = this.key(protocol, method);
    const handlers = this.notifications.get(key) ?? new Set<Handler>();
    const handler = { protocol, run: run as Handler["run"] };
    handlers.add(handler);
    this.notifications.set(key, handlers);
    return () => {
      handlers.delete(handler);
    };
  }
  /**
   * Send a notification. With `coalesce`, it is state where only the latest
   * value matters (a selection, a list of markers): it waits until the end
   * of the current task and replaces an unsent one of the same method.
   */
  notify<P extends Protocol, M extends keyof P["notifications"] & string>(
    protocol: P,
    method: M,
    params: Infer<P["notifications"][M]>,
    options: { coalesce?: boolean } = {},
  ): void {
    const message: Notify = {
      kind: "notify",
      channel: protocol.id,
      method,
      params: protocol.notifications[method]!.parse(params),
    };
    if (options.coalesce) {
      this.assertLive();
      this.enqueue(message);
    } else {
      this.send(message);
    }
  }
  call<P extends Protocol, M extends keyof P["requests"] & string>(
    protocol: P,
    method: M,
    params: Infer<P["requests"][M]["params"]>,
    options: { timeout?: number; token?: Cancellation } = {},
  ): Promise<Infer<P["requests"][M]["result"]>> {
    try {
      this.assertLive();
    } catch (error) {
      return Promise.reject(error);
    }
    const definition = protocol.requests[method]!;
    let parsed: unknown;
    try {
      parsed = definition.params.parse(params);
    } catch (error) {
      return Promise.reject(error);
    }
    if (options.token?.cancelled) {
      return Promise.reject(new RpcError("Cancelled", method));
    }
    return this.sendRequest({
      protocol,
      method,
      parsed,
      schema: definition.result,
      options,
    }) as Promise<Infer<P["requests"][M]["result"]>>;
  }

  private sendRequest({
    protocol,
    method,
    parsed,
    schema,
    options,
  }: OutgoingRequest): Promise<unknown> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      let timer: Disposer = () => {};
      let cancel: Disposer = () => {};
      const cleanup = () => {
        void timer();
        void cancel();
      };
      const fail = (code: string) => {
        if (!this.pending.delete(id)) {
          return;
        }
        cleanup();
        reject(new RpcError(code, method));
        this.send({ kind: "cancel", id });
      };
      this.pending.set(id, {
        schema,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanup,
      });
      timer = this.clock.after(options.timeout ?? 10_000, () =>
        fail("Timeout"),
      );
      cancel = options.token?.onCancel(() => fail("Cancelled")) ?? cancel;
      try {
        this.send({
          kind: "request",
          id,
          channel: protocol.id,
          method,
          params: parsed,
        });
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }
  private sendError(id: number, code: string, message: string): void {
    if (!this.disposed) {
      this.send({ kind: "error", id, code, message: message.slice(0, 4096) });
    }
  }
  private async receive(value: unknown): Promise<void> {
    if (this.disposed) {
      return;
    }
    let envelope: Envelope;
    try {
      envelope = parseEnvelope(value);
    } catch (error) {
      this.logger.warn("Dropped invalid RPC envelope", error);
      return;
    }
    switch (envelope.kind) {
      case "batch":
        await this.receiveBatch(envelope);
        return;
      case "cancel":
        this.incoming.get(envelope.id)?.token.cancel();
        this.incoming.delete(envelope.id);
        return;
      case "response":
      case "error":
        this.receiveResponse(envelope);
        return;
      case "notify":
        await this.receiveNotification(envelope);
        return;
      case "request":
        await this.receiveRequest(envelope);
    }
  }

  private async receiveBatch(
    batch: Extract<Envelope, { kind: "batch" }>,
  ): Promise<void> {
    if (batch.version <= this.receivedBatch) {
      this.logger.warn("Dropped stale RPC batch");
      return;
    }
    this.receivedBatch = batch.version;
    for (const message of batch.messages) {
      await this.receiveNotification(message);
    }
  }

  private receiveResponse(
    envelope: Extract<Envelope, { kind: "response" | "error" }>,
  ): void {
    const pending = this.pending.get(envelope.id);
    if (!pending) {
      return;
    }
    this.pending.delete(envelope.id);
    pending.cleanup();
    if (envelope.kind === "error") {
      pending.reject(new RpcError(envelope.code, envelope.message));
      return;
    }
    try {
      pending.resolve(pending.schema.parse(envelope.result));
    } catch (error) {
      pending.reject(new RpcError("InvalidResult", String(error)));
    }
  }

  private async receiveNotification(
    envelope: Extract<Envelope, { kind: "notify" }>,
  ): Promise<void> {
    const key = `${envelope.channel}/${envelope.method}`;
    for (const handler of [...(this.notifications.get(key) ?? [])]) {
      try {
        await handler.run(
          handler.protocol.notifications[envelope.method]!.parse(
            envelope.params,
          ),
          new CancelToken(),
        );
      } catch (error) {
        this.logger.warn("Dropped notification or failed listener", error);
      }
    }
  }

  private async receiveRequest(
    envelope: Extract<Envelope, { kind: "request" }>,
  ): Promise<void> {
    const key = `${envelope.channel}/${envelope.method}`;
    const handler = this.handlers.get(key);
    if (!handler) {
      this.sendError(envelope.id, "PluginDisabled", key);
      return;
    }
    if (this.incoming.has(envelope.id)) {
      this.logger.warn("Dropped duplicate RPC request");
      return;
    }
    let params: unknown;
    const definition = handler.protocol.requests[envelope.method]!;
    try {
      params = definition.params.parse(envelope.params);
    } catch (error) {
      this.logger.warn("Dropped invalid RPC params", error);
      return;
    }
    const token = new CancelToken();
    this.incoming.set(envelope.id, { token, key });
    try {
      const result = await handler.run(params, token);
      if (token.cancelled || this.disposed) {
        return;
      }
      this.sendResult(envelope.id, definition.result, result);
    } catch (error) {
      if (!token.cancelled) {
        this.sendError(
          envelope.id,
          error instanceof RpcError ? error.code : "HandlerFailed",
          String(error),
        );
      }
    } finally {
      this.incoming.delete(envelope.id);
    }
  }

  private sendResult(
    id: number,
    schema: Schema<unknown>,
    result: unknown,
  ): void {
    let parsed: unknown;
    try {
      parsed = schema.parse(result);
    } catch (error) {
      this.sendError(id, "InvalidResult", String(error));
      return;
    }
    this.send({ kind: "response", id, result: parsed });
  }
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      this.flush();
    } catch (error) {
      this.logger.warn("Dropped RPC batch on dispose", error);
    }
    this.disposed = true;
    await this.unlisten();
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(new RpcError("Disposed", "RPC endpoint disposed"));
    }
    for (const incoming of this.incoming.values()) {
      incoming.token.cancel();
    }
    this.pending.clear();
    this.incoming.clear();
    this.handlers.clear();
    this.notifications.clear();
  }
}
