import type { Disposer } from "@workshop/core";

/** Raw inspect fields, including local/remote and language-specific layers. */
export type ConfigurationInspection = Readonly<Record<string, unknown>>;

export interface ConfigurationProvider {
  get(key: string, resource: string): unknown;
  prepare(resource: string): Promise<void>;
}

/** In-memory contributions; the native Settings UI still owns settings writes. */
export interface Configuration {
  get<T>(key: string, fallback: T, resource?: string): T;
  inspect(key: string, resource: string): ConfigurationInspection | undefined;
  register(provider: ConfigurationProvider): Disposer;
  prepare(resource: string): Promise<void>;
  invalidate(): void;
  onDidChange(listener: () => void): Disposer;
}
