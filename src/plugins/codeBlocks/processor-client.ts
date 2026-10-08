import type { Endpoint } from "../../shared/rpc/endpoint";
import type { CancelToken } from "../../shared/rpc/lifecycle";
import type { Infer } from "../../kernel";
import { protocol, type processors } from "./protocol";
import type { ProcessorResult } from "./api";
export class ProcessorClient {
  private current: Infer<typeof processors> = {
    epoch: 0,
    revision: 0,
    languages: [],
  };
  private readonly cache = new Map<string, ProcessorResult>();
  private readonly pending = new Set<CancelToken>();
  constructor(private readonly rpc: Endpoint) {}
  configure(value: Infer<typeof processors>): void {
    if (
      value.epoch === this.current.epoch &&
      value.revision < this.current.revision
    ) {
      return;
    }
    this.current = value;
    this.clear();
  }
  accepts(language: string): boolean {
    return this.current.languages.includes(language);
  }
  async render(
    request: {
      language: string;
      source: string;
      uri: string;
      sourceLine: number;
    },
    token: CancelToken,
  ): Promise<ProcessorResult> {
    const revision = this.current.revision;
    const epoch = this.current.epoch;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(request.source),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const key = JSON.stringify([
      epoch,
      revision,
      request.language,
      request.uri,
      request.sourceLine,
      hash,
    ]);
    if (token.cancelled) {
      throw new Error("Code rendering cancelled");
    }
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    this.pending.add(token);
    try {
      const value = await this.rpc.call(
        protocol,
        "render",
        { ...request, revision, epoch },
        { token },
      );
      if (
        !token.cancelled &&
        revision === this.current.revision &&
        epoch === this.current.epoch
      ) {
        this.cache.set(key, value);
        if (this.cache.size > 64) {
          this.cache.delete(this.cache.keys().next().value!);
        }
      }
      return value;
    } finally {
      this.pending.delete(token);
    }
  }
  clear(): void {
    this.cache.clear();
    for (const token of this.pending) {
      token.cancel();
    }
    this.pending.clear();
  }
}
