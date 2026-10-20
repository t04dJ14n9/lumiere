import type { Endpoint } from "../../shared/rpc/endpoint";
import { CancelToken } from "../../shared/rpc/lifecycle";
import { protocol, type SearchResponse } from "./protocol";
import { errorMessage } from "../../shared/errors";
export type SearchUpdate =
  | {
      loading: true;
      results?: SearchResponse["results"];
      unreadable?: number;
    }
  | ({ loading: false; error?: string } & Partial<SearchResponse>);
interface Subscription {
  query: string;
  source: string;
  id?: string;
  update(value: SearchUpdate): void;
  token?: CancelToken;
}
export class QueryClient {
  private readonly subscriptions = new Set<Subscription>();
  private disposed = false;
  private nextId = 0;
  private readonly stopPartial: () => void;
  constructor(private readonly rpc: Endpoint) {
    this.stopPartial = rpc.on(protocol, "partial", (message) => {
      for (const subscription of this.subscriptions) {
        if (
          subscription.id === message.id &&
          !subscription.token?.cancelled
        ) {
          subscription.update({
            loading: true,
            results: message.results,
            unreadable: message.unreadable,
          });
        }
      }
    });
  }
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
    const id = `q${++this.nextId}`;
    subscription.id = id;
    subscription.update({ loading: true });
    void this.rpc
      .call(
        protocol,
        "query",
        { query: subscription.query, source: subscription.source, id },
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
            subscription.update({
              loading: false,
              error: errorMessage(error),
            });
          }
        },
      );
  }
  dispose(): void {
    this.disposed = true;
    this.stopPartial();
    for (const subscription of this.subscriptions) {
      subscription.token?.cancel();
    }
    this.subscriptions.clear();
  }
}
