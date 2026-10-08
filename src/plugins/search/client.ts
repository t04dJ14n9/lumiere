import type { Endpoint } from "../../shared/rpc/endpoint";
import { CancelToken } from "../../shared/rpc/lifecycle";
import { protocol, type SearchResponse } from "./protocol";
export type SearchUpdate =
  | { loading: true }
  | ({ loading: false; error?: string } & Partial<SearchResponse>);
interface Subscription {
  query: string;
  source: string;
  update(value: SearchUpdate): void;
  token?: CancelToken;
}
export class QueryClient {
  private readonly subscriptions = new Set<Subscription>();
  private disposed = false;
  constructor(private readonly rpc: Endpoint) {}
  watch(
    query: string,
    source: string,
    update: (value: SearchUpdate) => void,
  ): () => void {
    if (this.disposed) {
      return () => {};
    }
    const subscription: Subscription = { query, source, update };
    this.subscriptions.add(subscription);
    this.start(subscription);
    return () => {
      this.subscriptions.delete(subscription);
      subscription.token?.cancel();
    };
  }
  refresh(): void {
    for (const subscription of this.subscriptions) {
      this.start(subscription);
    }
  }
  private start(subscription: Subscription): void {
    subscription.token?.cancel();
    const token = new CancelToken();
    subscription.token = token;
    subscription.update({ loading: true });
    void this.rpc
      .call(
        protocol,
        "query",
        { query: subscription.query, source: subscription.source },
        { token },
      )
      .then(
        (response) => {
          if (!token.cancelled) {
            subscription.update({ loading: false, ...response });
          }
        },
        (error) => {
          if (!token.cancelled) {
            subscription.update({ loading: false, error: String(error) });
          }
        },
      );
  }
  dispose(): void {
    this.disposed = true;
    for (const subscription of this.subscriptions) {
      subscription.token?.cancel();
    }
    this.subscriptions.clear();
  }
}
