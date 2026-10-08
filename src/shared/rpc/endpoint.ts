import type { Protocol } from "../../kernel/protocol";
import type { Infer, Schema } from "../../kernel/schema";
import type { Disposer } from "../../kernel/types";
import type { Logger } from "../../kernel/logger";
import { silentLogger } from "../../kernel/logger";
import { parseEnvelope } from "./envelope";
import type { Envelope } from "./envelope";
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
export class Endpoint {
  private next = 1;
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
    this.transport.send(parseEnvelope(value));
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
  notify<P extends Protocol, M extends keyof P["notifications"] & string>(
    protocol: P,
    method: M,
    params: Infer<P["notifications"][M]>,
  ): void {
    this.send({
      kind: "notify",
      channel: protocol.id,
      method,
      params: protocol.notifications[method]!.parse(params),
    });
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
