import { receiveResponse } from "./response";
import { PeerSession, cancelPeer } from "./peer-session";
import { deliverNotification } from "./notification";
import type { Protocol } from "../../kernel/protocol";
import type { Infer, Schema } from "../schema";
import type { Disposer } from "../../kernel/types";
import { silentLogger, type Logger } from "../../kernel/logger";
import { ApplyQueue, CoalescingQueue } from "./queues";
import {
  addressEnvelope,
  parseEnvelope,
  resultEnvelope,
  type Envelope,
} from "./envelope";
import type {
  Handler,
  Notify,
  OutgoingRequest,
  Pending,
} from "./endpoint-types";
import type { Transport, Clock, Cancellation } from "./lifecycle";
import { CancelToken, RpcError } from "./lifecycle";
export * from "./lifecycle";
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
 * - Received state applies in arrival order: notifications and batches run
 *   one at a time, each awaited (asynchronous handlers included) before the
 *   next starts, and a received request starts only after everything that
 *   arrived before it has applied. Responses, errors and cancels are handled
 *   at once, so a handler awaiting a call cannot deadlock the queue.
 * - After `dispose()`, no further notification handler starts.
 */
export class Endpoint {
  private next = 1;
  private batchVersion = 0;
  private receivedBatch = 0;
  /** Received state still applying (see the invariants). */
  private applying = new ApplyQueue();
  private epoch = 0;
  private readonly peer: PeerSession | undefined;
  private readonly outgoing = new CoalescingQueue<Notify>(() => this.flush());
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
    private readonly incarnation?: { session: string; restartOn?: string },
  ) {
    this.peer = incarnation
      ? new PeerSession(incarnation.session, incarnation.restartOn)
      : undefined;
    this.unlisten = transport.listen((value) => {
      // Never rejects: every failure is logged inside.
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
    this.transport.send(
      addressEnvelope(value, this.incarnation?.session, this.peer?.session),
    );
  }

  /** Send the coalesced notifications now, as one batch. */
  flush(): void {
    const messages = this.disposed ? [] : this.outgoing.take();
    if (messages.length === 0) {
      return;
    }
    this.transport.send(
      addressEnvelope(
        { kind: "batch", version: ++this.batchVersion, messages },
        this.incarnation?.session,
        this.peer?.session,
      ),
    );
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
      this.outgoing.add(message);
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
    const acceptance = this.peer?.accept(envelope);
    if (acceptance === "drop") {
      return;
    }
    if (acceptance === "replace") {
      this.epoch++;
      this.receivedBatch = 0;
      this.applying = new ApplyQueue();
      this.outgoing.take();
      cancelPeer(this.pending, this.incoming);
    }
    switch (envelope.kind) {
      case "batch":
        await this.apply(() => this.receiveBatch(envelope));
        return;
      case "cancel":
        this.incoming.get(envelope.id)?.token.cancel();
        this.incoming.delete(envelope.id);
        return;
      case "response":
      case "error":
        receiveResponse(envelope, this.pending);
        return;
      case "notify":
        await this.apply(() => this.receiveNotification(envelope));
        return;
      case "request":
        await this.receiveRequest(envelope, this.applying.barrier);
    }
  }

  /** Run `work` after the state received before it has applied. */
  private apply(work: () => Promise<void>): Promise<void> {
    const epoch = this.epoch;
    return this.applying.run(async () => {
      if (!this.disposed && epoch === this.epoch) {
        await work();
      }
    });
  }

  private async receiveBatch(
    batch: Extract<Envelope, { kind: "batch" }>,
  ): Promise<void> {
    if (batch.version <= this.receivedBatch) {
      this.logger.warn("Dropped stale RPC batch");
      return;
    }
    this.receivedBatch = batch.version;
    const epoch = this.epoch;
    for (const message of batch.messages) {
      if (this.disposed || epoch !== this.epoch) {
        return;
      }
      await this.receiveNotification(message);
    }
  }

  private async receiveNotification(
    envelope: Extract<Envelope, { kind: "notify" }>,
  ): Promise<void> {
    const epoch = this.epoch;
    await deliverNotification(
      envelope,
      this.notifications.get(`${envelope.channel}/${envelope.method}`) ?? [],
      () => !this.disposed && epoch === this.epoch,
      this.logger,
    );
  }

  /** Runs once `applied` (the state received before it) has applied. */
  private async receiveRequest(
    envelope: Extract<Envelope, { kind: "request" }>,
    applied: Promise<void> | undefined,
  ): Promise<void> {
    const key = `${envelope.channel}/${envelope.method}`;
    if (this.incoming.has(envelope.id)) {
      this.logger.warn("Dropped duplicate RPC request");
      return;
    }
    // Registered while it waits, so a cancel or a disabled handler reaches it.
    const token = new CancelToken();
    this.incoming.set(envelope.id, { token, key });
    try {
      if (applied) {
        await applied;
      }
      if (token.cancelled || this.disposed) {
        return;
      }
      const handler = this.handlers.get(key);
      if (!handler) {
        this.sendError(envelope.id, "PluginDisabled", key);
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
      await this.runRequest(envelope.id, handler, definition.result, {
        params,
        token,
      });
    } finally {
      if (this.incoming.get(envelope.id)?.token === token) {
        this.incoming.delete(envelope.id);
      }
    }
  }

  private async runRequest(
    id: number,
    handler: Handler,
    result: Schema<unknown>,
    { params, token }: { params: unknown; token: CancelToken },
  ): Promise<void> {
    try {
      const value = await handler.run(params, token);
      if (token.cancelled || this.disposed) {
        return;
      }
      this.sendResult(id, result, value);
    } catch (error) {
      if (!token.cancelled) {
        this.sendError(
          id,
          error instanceof RpcError ? error.code : "HandlerFailed",
          String(error),
        );
      }
    }
  }

  private sendResult(
    id: number,
    schema: Schema<unknown>,
    result: unknown,
  ): void {
    this.send(resultEnvelope(id, schema, result));
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
